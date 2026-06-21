import os
import re
import json
import shutil
import tempfile
import logging
import asyncio
from typing import AsyncGenerator

import yt_dlp
import requests
from mutagen.id3 import ID3, TIT2, TPE1, TALB, APIC, error as MutagenError
from mutagen.mp4 import MP4, MP4Cover

from cache import metadata_cache

logger = logging.getLogger(__name__)


def _get_base_opts() -> dict:
    return {
        "quiet": True,
        "no_warnings": True,
        "source_address": "0.0.0.0",
        "extractor_retries": 3,
        "retries": 5,
        "throttled_rate": "100K",
        "concurrent_fragments": 5,
        "fragment_retries": 10,
        "file_access_retries": 3,
        "no_mtime": True,
        "no_part": True,
    }


def _find_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


SOURCES = [
    {"name": "youtube", "prefix": "ytsearch1"},
    {"name": "soundcloud", "prefix": "scsearch1"},
    {"name": "bandcamp", "prefix": "bcsearch1"},
]


def _title_matches(title: str, artist: str, found_title: str | None, found_uploader: str | None = None) -> bool:
    if not found_title:
        return False
    t = title.lower().strip()
    a = artist.lower().strip()
    ft = re.sub(r'\([^)]*\)|\[[^\]]*\]|-\s*\w+\s*topic', '', found_title.lower()).strip()
    fu = found_uploader.lower().strip() if found_uploader else ""

    if t not in ft:
        return False
    if not a:
        return True
    return a in ft or a in fu


def search_track(query: str, source: str, prefix: str) -> list[dict]:
    """
    Search for a track and return entries with full metadata (title, uploader, url).
    Uses extract_flat=False to get full info in one call, avoiding a second API round-trip.
    """
    opts = {
        **_get_base_opts(),
        "extract_flat": False,
        "default_search": prefix,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"{prefix}:{query}", download=False)
            if not info or "entries" not in info or not info["entries"]:
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
            return entries
    except Exception as e:
        logger.warning(f"search_track: {source} failed for '{query}': {e}")
        return []


def _safe(s: str) -> str:
    return re.sub(r'[^\w\-_., ]', "_", s)


async def stream_download(
    title: str,
    artist: str,
    album: str,
    artwork_url: str | None,
    source_url: str | None = None,
) -> AsyncGenerator[str, None]:
    try:
        filepath, ext = await asyncio.to_thread(download_track, title, artist, album, artwork_url, source_url)
        yield json.dumps({"type": "complete", "filepath": filepath, "ext": ext}) + "\n"

        with open(filepath, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                yield chunk
    except Exception as e:
        yield json.dumps({"type": "error", "message": str(e)}) + "\n"


def download_track(
    title: str,
    artist: str,
    album: str,
    artwork_url: str | None,
    source_url: str | None = None,
) -> tuple[str, str]:
    if source_url and not source_url.startswith("https://open.spotify.com"):
        track_urls = [(source_url, "direct")]
    else:
        query = f"{artist} {title}"
        track_urls = []
        for src in SOURCES:
            entries = search_track(query, src["name"], src["prefix"])
            for entry in entries:
                if _title_matches(title, artist, entry.get("title"), entry.get("uploader")):
                    track_urls.append((entry["url"], src["name"]))
                    break
            if track_urls:
                break

        if not track_urls:
            raise RuntimeError(f"No track found on any source for '{title}' by {artist}")

    ffmpeg_available = _find_ffmpeg()
    last_error: Exception | None = None

    for track_url, source_name in track_urls:
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
                    "preferredcodec": "mp3",
                    "preferredquality": "320",
                }
            ]
        else:
            opts["format"] = "bestaudio[ext=m4a]/bestaudio"

        if "youtube.com" in track_url or "youtu.be" in track_url:
            opts["extractor_args"] = {"youtube": {"client": ["android", "ios"]}}

        try:
            logger.info(f"download_track: trying {source_name}: {track_url}")
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([track_url])

            files = [f for f in os.listdir(tmpdir) if not f.endswith('.part')]
            if not files:
                shutil.rmtree(tmpdir, ignore_errors=True)
                continue

            files.sort()
            expected = f"{safe_name}.mp3"
            filepath = os.path.join(tmpdir, expected if expected in files else files[0])
            ext = os.path.splitext(filepath)[1].lower()

            if ext == ".mp3":
                _tag_mp3(filepath, title, artist, album, artwork_url)
            elif ext in [".m4a", ".aac", ".mp4"]:
                _tag_m4a(filepath, title, artist, album, artwork_url)

            logger.info(f"download_track: SUCCESS from {source_name}: {track_url}")
            return filepath, ext

        except yt_dlp.DownloadError as e:
            shutil.rmtree(tmpdir, ignore_errors=True)
            last_error = e
            if "DRM" in str(e):
                logger.warning(f"download_track: {source_name} {track_url} is DRM protected, trying next...")
                continue
            raise
        except Exception as e:
            shutil.rmtree(tmpdir, ignore_errors=True)
            raise

    raise RuntimeError(
        f"Could not download '{title}' by {artist}. "
        f"Tried {len(track_urls)} source(s). "
        f"{'Last error: ' + str(last_error) if last_error else ''}"
    )


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
        resp = requests.get(artwork_url, timeout=10)
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
    except requests.RequestException:
        pass
