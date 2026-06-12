import os
import re
import tempfile
import shutil

import yt_dlp
import requests
from mutagen.id3 import ID3, TIT2, TPE1, TALB, APIC, error as MutagenError


def search_youtube(query: str) -> str | None:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "default_search": "ytsearch1",
        "source_address": "0.0.0.0",
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"ytsearch1:{query}", download=False)
        if not info or "entries" not in info or not info["entries"]:
            return None
        return f"https://www.youtube.com/watch?v={info['entries'][0]['id']}"


def _safe(s: str) -> str:
    return re.sub(r'[^\w\-_., ]', "_", s)


def download_track(
    title: str,
    artist: str,
    album: str,
    artwork_url: str | None,
) -> str:
    query = f"{artist} {title} official audio"
    youtube_url = search_youtube(query)
    if not youtube_url:
        raise RuntimeError(f"No YouTube video found for '{title}' by {artist}")

    tmpdir = tempfile.mkdtemp()
    safe_name = f"{_safe(artist)} - {_safe(title)}"
    outtmpl = os.path.join(tmpdir, f"{safe_name}.%(ext)s")

    opts = {
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "320",
            }
        ],
        "quiet": True,
        "no_warnings": True,
        "source_address": "0.0.0.0",
    }

    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([youtube_url])

    mp3_files = [f for f in os.listdir(tmpdir) if f.endswith(".mp3")]
    if not mp3_files:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise RuntimeError("Downloaded file not found (ffmpeg may be missing)")

    filepath = os.path.join(tmpdir, mp3_files[0])

    tag_file(filepath, title, artist, album, artwork_url)

    return filepath


def tag_file(path: str, title: str, artist: str, album: str, artwork_url: str | None):
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
