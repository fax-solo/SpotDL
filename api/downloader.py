import os
import re
import json
import time
import stat
import shutil
import subprocess
import tempfile
import logging
import asyncio
from typing import AsyncGenerator

import yt_dlp
import requests
from mutagen.id3 import ID3, TIT2, TPE1, TALB, APIC, error as MutagenError
from mutagen.mp4 import MP4, MP4Cover

from cache import get_cache, set_cache
from _matching import normalize, strip_feat, title_matches
from shared import requests_retry_session, source_is_open, get_circuit_breaker, metrics
from spotify import fetch_metadata, parse_url
from artwork_fallback import find_artwork

_cover_session = requests_retry_session()

logger = logging.getLogger(__name__)

# Mirrors audioFilterArgs() in frontend/src/lib/audioProcessor.ts so every
# download path produces identical audio for the chosen variant.
VARIANT_FILTERS = {
    "sped_up": "atempo=1.25",
    "slowed_reverb": "atempo=0.85,aecho=0.8:0.9:1000:0.3",
}


def _apply_variant_filter(filepath: str, variant: str | None, quality: str) -> str:
    """Apply the speed/reverb filter for non-normal variants, in place.

    Returns the filepath (unchanged on failure or when ffmpeg is missing, so
    the download still completes — the same behavior as the client fallback
    cannot be perfectly mirrored without ffmpeg).
    """
    if not variant or variant not in VARIANT_FILTERS:
        return filepath
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        logger.warning(f"variant '{variant}' requested but ffmpeg is missing; saving unprocessed audio")
        return filepath
    ext = os.path.splitext(filepath)[1].lower()
    if ext == ".m4a":
        codec_args = ["-codec:a", "aac", "-b:a", f"{quality}k"]
    else:
        codec_args = ["-codec:a", "libmp3lame", "-b:a", f"{quality}k"]
    tmp = f"{filepath}.variant.tmp"
    cmd = [ffmpeg, "-y", "-i", filepath, "-af", VARIANT_FILTERS[variant], *codec_args, tmp]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=600)
        os.replace(tmp, filepath)
    except (subprocess.CalledProcessError, OSError, subprocess.TimeoutExpired) as e:
        logger.warning(f"variant filter for '{variant}' failed ({e}); keeping unprocessed audio")
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except OSError:
            pass
    return filepath


def _get_base_opts() -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "source_address": "0.0.0.0",
        "extractor_retries": 3,
        "retries": 5,
        "socket_timeout": 30,
        "throttled_rate": "100K",
        "concurrent_fragments": 5,
        "fragment_retries": 10,
        "file_access_retries": 3,
        "no_mtime": True,
        "no_part": True,
    }
    cookie_file = os.environ.get("YTDLP_COOKIE_FILE", "")
    if cookie_file and os.path.isfile(cookie_file):
        opts["cookiefile"] = cookie_file
    return opts


def _find_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


SOURCES = [
    {"name": "youtube", "prefix": "ytsearch1"},
    {"name": "soundcloud", "prefix": "scsearch1"},
    {"name": "bandcamp", "prefix": "bcsearch1"},
]

# Additional sources tried when primary sources fail
FALLBACK_SOURCES = [
    {"name": "youtube_music", "prefix": "ytsearch1"},
]

TOPIC_SOURCES = [
    {"name": "youtube_music", "prefix": "ytsearch1", "topic": True},
    {"name": "youtube", "prefix": "ytsearch1", "topic": False},
]


def search_track_topic(artist: str, title: str) -> list[dict]:
    for src in TOPIC_SOURCES:
        if source_is_open(src["name"]):
            logger.info("search_track_topic: skip %s (circuit open)", src["name"])
            continue
        query = f"{artist} - {title} Topic" if src["topic"] else f"{artist} - {title}"
        logger.info("search_track_topic: trying %s with '%s'", src["name"], query)
        results = search_track(query, src["name"], src["prefix"])
        if results:
            return results
    return []


def download_track_combined(
    query_or_url: str,
    quality: str = "320",
    output_format: str = "mp3",
    variant: str = "normal",
) -> tuple[str, str]:
    parsed = parse_url(query_or_url)
    if parsed:
        meta = fetch_metadata(query_or_url)
        if parsed[0] != "track" and "tracks" in meta and meta["tracks"]:
            meta = meta["tracks"][0]
        title = meta["title"]
        artist = meta["artist"]
        album = meta.get("album", "Single")
        artwork_url = meta.get("artwork_url")
        if not artwork_url:
            artwork_url = find_artwork(title, artist, meta.get("isrc"))
    else:
        title = query_or_url
        artist = ""
        album = "Single"
        artwork_url = None

    if artist:
        topic_results = search_track_topic(artist, title)
        if topic_results:
            match = None
            for entry in topic_results:
                if title_matches(title, artist, entry.get("title"), entry.get("uploader")):
                    match = entry
                    break
            if match:
                return download_track(
                    title, artist, album, artwork_url, match["url"], quality, output_format, variant=variant,
                )
            logger.info("download_track_combined: no topic match found, falling through to regular search")

    return download_track(title, artist, album, artwork_url, quality=quality, output_format=output_format, variant=variant)


# All matching/tokenization logic moved to _matching.py
# Imports: normalize, strip_feat, title_matches


def search_track(query: str, source: str, prefix: str) -> list[dict]:
    """
    Search for a track and return entries with full metadata (title, uploader, url).
    Uses extract_flat=False to get full info in one call, avoiding a second API round-trip.
    """
    cb = get_circuit_breaker(source)
    if cb.is_open():
        logger.info("search_track: skip %s (circuit open)", source)
        return []

    opts = {
        **_get_base_opts(),
        "extract_flat": False,
        "default_search": prefix,
    }
    t0 = time.time()
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"{prefix}:{query}", download=False)
            if not info or "entries" not in info or not info["entries"]:
                metrics.record(f"search.{source}", time.time() - t0)
                return []
            entries = []
            for entry in info["entries"]:
                if entry:
                    url = entry.get("url") or entry.get("webpage_url")
                    if url:
                        entries.append({
                            "url": url,
                            "title": entry.get("title"),
                            "uploader": entry.get("uploader") or entry.get("channel") or entry.get("creator"),
                        })
            logger.info(f"search_track: {source} found {len(entries)} result(s) for '{query}'")
            cb.record_success()
            metrics.record(f"search.{source}.ok", time.time() - t0)
            return entries
    except Exception as e:
        logger.warning(f"search_track: {source} failed for '{query}': {e}")
        cb.record_failure()
        metrics.inc(f"search.{source}.error")
        metrics.record(f"search.{source}.error", time.time() - t0)
        return []


def _safe(s: str) -> str:
    return re.sub(r'[^\w\-_., ]', "_", s)


class _ProgressTracker:
    def __init__(self):
        self.progress: dict[str, str | float | None] = {"status": "starting", "pct": 0, "speed": None, "eta": None}

    def hook(self, d: dict):
        status = d.get("status", "")
        if status == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            self.progress["status"] = "downloading"
            self.progress["pct"] = round(downloaded / total * 100, 1) if total else 0
            self.progress["speed"] = d.get("speed")
            self.progress["eta"] = d.get("eta")
        elif status == "finished":
            self.progress["status"] = "processing"
            self.progress["pct"] = 100


async def stream_download(
    title: str,
    artist: str,
    album: str,
    artwork_url: str | None,
    source_url: str | None = None,
    quality: str = "320",
    output_format: str = "mp3",
    variant: str = "normal",
) -> AsyncGenerator[str, None]:
    tracker = _ProgressTracker()

    if not _find_ffmpeg():
        yield json.dumps({"type": "warning", "message": "ffmpeg not found on server — converting client-side instead", "code": "ffmpeg_missing"}) + "\n"

    def _run():
        return _download_with_progress(tracker, title, artist, album, artwork_url, source_url, quality, output_format, variant=variant)

    task = asyncio.create_task(asyncio.to_thread(_run))

    filepath: str | None = None
    tmpdir: str | None = None

    try:
        last_pct = -1
        while not task.done():
            p = tracker.progress
            status = p.get("status", "starting")
            pct = p.get("pct", 0)
            if pct != last_pct and status in ("downloading", "processing", "starting"):
                line = {"type": "progress", "status": status, "pct": pct}
                speed = p.get("speed")
                eta = p.get("eta")
                if speed is not None:
                    line["speed"] = round(speed / 1024, 1) if speed else 0
                if eta is not None:
                    line["eta"] = int(eta)
                yield json.dumps(line) + "\n"
                last_pct = pct
            await asyncio.sleep(0.25)

        filepath, ext = task.result()
        tmpdir = os.path.dirname(filepath) if filepath else None
        yield json.dumps({"type": "complete", "filepath": filepath, "ext": ext}) + "\n"
        with open(filepath, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                yield chunk
    except GeneratorExit:
        task.cancel()
        raise
    except asyncio.CancelledError:
        task.cancel()
        raise
    except Exception as e:
        yield json.dumps({"type": "error", "message": str(e)}) + "\n"
    finally:
        if tmpdir and os.path.isdir(tmpdir):
            shutil.rmtree(tmpdir, ignore_errors=True)


def _resolve_urls(title: str, artist: str, source_url: str | None, isrc: str | None = None) -> list[tuple[str, str]]:
    if source_url and not source_url.startswith("https://open.spotify.com"):
        return [(source_url, "direct")]
    query = f"{artist} {title}"
    seen_urls: set[str] = set()
    track_urls: list[tuple[str, str]] = []
    all_sources = SOURCES + FALLBACK_SOURCES
    for src in all_sources:
        entries = search_track(query, src["name"], src["prefix"])
        for entry in entries:
            entry_url = entry.get("url", "")
            if entry_url in seen_urls:
                continue
            seen_urls.add(entry_url)
            if title_matches(title, artist, entry.get("title"), entry.get("uploader")):
                track_urls.append((entry_url, src["name"]))
        if track_urls:
            break
    if not track_urls:
        raise RuntimeError(f"No track found on any source for '{title}' by {artist}")
    return track_urls


def _do_download(
    track_urls: list[tuple[str, str]],
    title: str,
    artist: str,
    album: str,
    artwork_url: str | None,
    quality: str,
    output_format: str,
    tracker: _ProgressTracker | None = None,
    variant: str = "normal",
) -> tuple[str, str]:
    ffmpeg_available = _find_ffmpeg()
    last_error: Exception | None = None

    for track_url, source_name in track_urls:
        tmpdir = None
        success = False
        try:
            tmpdir = tempfile.mkdtemp()
            safe_name = f"{_safe(artist)} - {_safe(title)}"
            outtmpl = os.path.join(tmpdir, f"{safe_name}.%(ext)s")

            opts = {
                **_get_base_opts(),
                "outtmpl": outtmpl,
            }

            if ffmpeg_available:
                opts["format"] = "bestaudio/best"
                opts["postprocessors"] = [
                    {
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": output_format if output_format in ("mp3", "m4a") else "mp3",
                        "preferredquality": quality,
                    }
                ]
            else:
                opts["format"] = "bestaudio[ext=m4a]/bestaudio"

            if "youtube.com" in track_url or "youtu.be" in track_url:
                opts["extractor_args"] = {
                    "youtube": {
                        "client": ["android", "ios", "web_music"],
                        "player_client": ["android", "ios", "web_music"],
                    }
                }

            if tracker:
                opts["progress_hooks"] = [tracker.hook]

            logger.info(f"download_track: trying {source_name}: {track_url}")
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([track_url])

            files = [f for f in os.listdir(tmpdir) if not f.endswith('.part')]
            if not files:
                get_circuit_breaker(source_name).record_failure()
                continue

            files.sort()
            ext_expected = output_format if output_format in ("mp3", "m4a") else "mp3"
            expected = f"{safe_name}.{ext_expected}"
            filepath = os.path.join(tmpdir, expected if expected in files else files[0])
            ext = os.path.splitext(filepath)[1].lower()

            if variant != "normal":
                filepath = _apply_variant_filter(filepath, variant, quality)
                ext = os.path.splitext(filepath)[1].lower()

            if ext == ".mp3":
                _tag_mp3(filepath, title, artist, album, artwork_url)
            elif ext in [".m4a", ".aac", ".mp4"]:
                _tag_m4a(filepath, title, artist, album, artwork_url)

            logger.info(f"download_track: SUCCESS from {source_name}: {track_url}")
            get_circuit_breaker(source_name).record_success()
            success = True
            return filepath, ext

        except yt_dlp.DownloadError as e:
            last_error = e
            get_circuit_breaker(source_name).record_failure()
            if "DRM" in str(e):
                logger.warning(f"download_track: {source_name} {track_url} is DRM protected, trying next...")
                continue
            raise
        finally:
            # The caller owns cleanup of the temp dir on success (it still needs
            # the file to serve/stream). Only clean up on failure to avoid
            # deleting the file before it is served.
            if tmpdir and os.path.isdir(tmpdir) and not success:
                shutil.rmtree(tmpdir, ignore_errors=True)

    raise RuntimeError(
        f"Could not download '{title}' by {artist}. "
        f"Tried {len(track_urls)} source(s). "
        f"{'Last error: ' + str(last_error) if last_error else ''}"
    )


def download_track(
    title: str,
    artist: str,
    album: str,
    artwork_url: str | None,
    source_url: str | None = None,
    quality: str = "320",
    output_format: str = "mp3",
    isrc: str | None = None,
    variant: str = "normal",
) -> tuple[str, str]:
    track_urls = _resolve_urls(title, artist, source_url, isrc)
    return _do_download(track_urls, title, artist, album, artwork_url, quality, output_format, variant=variant)


def _download_with_progress(tracker: _ProgressTracker, title, artist, album, artwork_url, source_url, quality, output_format, isrc=None, variant="normal"):
    track_urls = _resolve_urls(title, artist, source_url, isrc)
    return _do_download(track_urls, title, artist, album, artwork_url, quality, output_format, tracker, variant)


def _tag_mp3(path: str, title: str, artist: str, album: str, artwork_url: str | None):
    try:
        audio = ID3(path)
    except MutagenError:
        audio = ID3()
    audio["TIT2"] = TIT2(encoding=3, text=title)
    audio["TPE1"] = TPE1(encoding=3, text=artist)
    audio["TALB"] = TALB(encoding=3, text=album)
    if artwork_url:
        _embed_cover(audio, artwork_url, "mp3")
    audio.save(path)


def _tag_m4a(path: str, title: str, artist: str, album: str, artwork_url: str | None):
    try:
        audio = MP4(path)
        audio["\xa9nam"] = title
        audio["\xa9ART"] = artist
        audio["\xa9alb"] = album
        if artwork_url:
            _embed_cover(audio, artwork_url, "m4a")
        audio.save()
    except Exception as e:
        logger.warning(f"Failed to tag m4a: {e}")


def _embed_cover(audio, artwork_url: str, fmt: str):
    try:
        resp = _cover_session.get(artwork_url, timeout=10)
        if resp.status_code == 200:
            if fmt == "mp3":
                audio["APIC"] = APIC(
                    encoding=3,
                    mime="image/jpeg",
                    type=3,
                    desc="Cover",
                    data=resp.content,
                )
            elif fmt == "m4a":
                audio["covr"] = [MP4Cover(resp.content, MP4Cover.FORMAT_JPEG)]
    except requests.RequestException as e:
        logger.debug("Failed to embed cover art: %s", e)


def _pick_best_entry(entries: list[dict], title: str, artist: str) -> dict | None:
    """Pick the entry whose title matches, preferring an artist match."""
    for entry in entries:
        if title_matches(title, artist, entry.get("title"), entry.get("uploader")):
            return entry
    for entry in entries:
        if title_matches(title, "", entry.get("title"), entry.get("uploader")):
            return entry
    return entries[0] if entries else None


def _extract_audio_url(track_url: str, source: str, title: str, artist: str) -> dict | None:
    """Extract a direct audio URL for a track page. Returns None on failure."""
    try:
        opts = {
            **_get_base_opts(),
            "format": "bestaudio[ext=m4a]/bestaudio",
            "extract_flat": False,
        }
        if source in ("youtube", "youtube_music"):
            opts["extractor_args"] = {
                "youtube": {
                    "client": ["android", "ios", "web_music"],
                    "player_client": ["android", "ios", "web_music"],
                }
            }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(track_url, download=False)
            if not info:
                logger.warning("resolve_audio: extract_info returned None for %s", track_url)
                return None

            audio_url = info.get("url")
            if not audio_url:
                formats = info.get("formats", [])
                if formats:
                    audio_fmts = [f for f in formats if f.get("vcodec") == "none" and f.get("acodec") != "none"]
                    if audio_fmts:
                        audio_fmts.sort(key=lambda f: f.get("abr", 0) or 0, reverse=True)
                        audio_url = audio_fmts[0].get("url")

            if not audio_url:
                logger.warning("resolve_audio: no audio URL found in extract_info for %s", track_url)
                return None

            return {
                "url": audio_url,
                "source": source,
                "title": info.get("title", title),
                "artist": info.get("uploader", artist),
                "duration": info.get("duration", 0),
                "thumbnail": info.get("thumbnail"),
                "ext": info.get("ext", "m4a"),
            }
    except Exception as e:
        logger.error("resolve_audio: failed for %s: %s", track_url, e)
        return None


def resolve_audio(
    title: str,
    artist: str,
    album: str | None = None,
    isrc: str | None = None,
    duration_ms: int | None = None,
) -> dict | None:
    cache_key = f"resolve:{title}|{artist}|{album or ''}|{isrc or ''}"
    cached = get_cache(cache_key)
    if cached:
        logger.info("resolve_audio: cache hit for '%s'", cache_key)
        return cached

    logger.info("resolve_audio: searching '%s' by '%s'", title, artist)
    for src in SOURCES + FALLBACK_SOURCES:
        name, prefix = src["name"], src["prefix"]
        entries = search_track(f"{artist} {title}", name, prefix)
        if not entries:
            entries = search_track(title, name, prefix)
        best_entry = _pick_best_entry(entries, title, artist)
        if best_entry:
            track_url = best_entry["url"]
            logger.info("resolve_audio: matched %s on %s -> %s", best_entry.get("title"), name, track_url)
            result = _extract_audio_url(track_url, name, title, artist)
            if result:
                set_cache(cache_key, result)
                logger.info("resolve_audio: success for '%s' by '%s' via %s", title, artist, name)
                return result
            logger.warning("resolve_audio: %s failed to extract, trying next source", name)

    logger.warning("resolve_audio: no results for '%s' by '%s'", title, artist)
    return None
