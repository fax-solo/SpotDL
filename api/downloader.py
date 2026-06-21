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

logger = logging.getLogger(__name__)


def _get_base_opts() -> dict:
    return {
        "quiet": True,
        "no_warnings": True,
        "source_address": "0.0.0.0",
        "extractor_retries": 3,
        "retries": 5,
        "throttled_rate": "5M",
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


def search_track(query: str, source: str, prefix: str) -> list[str]:
    opts = {
        **_get_base_opts(),
        "extract_flat": True,
        "default_search": prefix,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"{prefix}:{query}", download=False)
            if not info or "entries" not in info or not info["entries"]:
                return []
            urls = []
            for entry in info["entries"]:
                url = entry.get("url") or entry.get("webpage_url")
                if url:
                    urls.append(url)
            logger.info(f"search_track: {source} found {len(urls)} result(s) for '{query}'")
            return urls
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
    """
    Async generator that yields NDJSON progress events, then yields the file data
    prefixed with a metadata header, or yields an error event on failure.
    """
    try:
        filepath, ext = download_track(title, artist, album, artwork_url, source_url)
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
            urls = search_track(query, src["name"], src["prefix"])
            for url in urls:
                if src["name"] == "direct":
                    track_urls.append((url, src["name"]))
                else:
                    try:
                        with yt_dlp.YoutubeDL({**_get_base_opts(), "extract_flat": False}) as ydl:
                            info = ydl.extract_info(url, download=False)
                            found_title = info.get("title") if info else None
                            found_uploader = info.get("uploader") or info.get("channel") or info.get("creator") or None
                            if _title_matches(title, artist, found_title, found_uploader):
                                track_urls.append((url, src["name"]))
                                break
                            logger.info(f"download_track: {src['name']} result '{found_title}' doesn't match '{title}' by {artist}, trying next...")
                    except Exception as e:
                        logger.warning(f"download_track: could not verify {url}, will try anyway: {e}")
                        track_urls.append((url, src["name"]))
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
            "format": "bestaudio[ext=mp3]/best[ext=mp3]/bestaudio/best"
            if not ffmpeg_available
            else "bestaudio[ext=mp3]/bestaudio/best",
            "outtmpl": outtmpl,
        }
        if ffmpeg_available:
            opts["postprocessors"] = [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "320",
                }
            ]

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
        try:
            resp = requests.get(artwork_url, timeout=10)
            if resp.status_code == 200:
                audio["APIC"] = APIC(
                    encoding=3,
                    mime="image/jpeg",
                    type=3,
                    desc="Cover",
                    data=resp.content,
                )
        except requests.RequestException:
            pass
    audio.save(path)


def _tag_m4a(path: str, title: str, artist: str, album: str, artwork_url: str | None):
    try:
        audio = MP4(path)
        audio["\xa9nam"] = title
        audio["\xa9ART"] = artist
        audio["\xa9alb"] = album
        if artwork_url:
            try:
                resp = requests.get(artwork_url, timeout=10)
                if resp.status_code == 200:
                    audio["covr"] = [MP4Cover(resp.content, MP4Cover.FORMAT_JPEG)]
            except requests.RequestException:
                pass
        audio.save()
    except Exception as e:
        logger.warning(f"Failed to tag m4a: {e}")
