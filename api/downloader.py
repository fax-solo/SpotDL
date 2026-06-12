import os
import re
import shutil
import tempfile
import logging

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


def search_track(query: str) -> str | None:
    opts = {
        **_get_base_opts(),
        "extract_flat": True,
        "default_search": "scsearch1",
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"scsearch1:{query}", download=False)
        if not info or "entries" not in info or not info["entries"]:
            return None
        return info["entries"][0]["url"]


def _safe(s: str) -> str:
    return re.sub(r'[^\w\-_., ]', "_", s)


def download_track(
    title: str,
    artist: str,
    album: str,
    artwork_url: str | None,
) -> tuple[str, str]:
    query = f"{artist} {title}"
    track_url = search_track(query)
    if not track_url:
        raise RuntimeError(f"No track found on SoundCloud for '{title}' by {artist}")

    tmpdir = tempfile.mkdtemp()
    safe_name = f"{_safe(artist)} - {_safe(title)}"
    outtmpl = os.path.join(tmpdir, f"{safe_name}.%(ext)s")

    ffmpeg_available = _find_ffmpeg()

    if ffmpeg_available:
        opts = {
            **_get_base_opts(),
            "format": "bestaudio/best",
            "outtmpl": outtmpl,
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "320",
                }
            ],
        }
    else:
        opts = {
            **_get_base_opts(),
            "format": "bestaudio/best",
            "outtmpl": outtmpl,
        }

    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([track_url])

    files = os.listdir(tmpdir)
    if not files:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise RuntimeError("No files downloaded")

    filepath = os.path.join(tmpdir, files[0])
    ext = os.path.splitext(filepath)[1].lower()

    if ext == ".mp3":
        _tag_mp3(filepath, title, artist, album, artwork_url)
    elif ext in [".m4a", ".aac", ".mp4"]:
        _tag_m4a(filepath, title, artist, album, artwork_url)

    return filepath, ext


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
