import re
import logging

import httpx
from mutagen.id3 import ID3, USLT, SYLT, error as MutagenError

logger = logging.getLogger("smartdl.lyrics")

LRCLIB_BASE = "https://lrclib.net/api"


def fetch_lrclib(artist: str, title: str, album: str = "", duration: float = 0) -> dict:
    params = {
        "track_name": title,
        "artist_name": artist,
        "album_name": album,
    }
    if duration > 0:
        params["duration"] = str(duration)
    try:
        resp = httpx.get(f"{LRCLIB_BASE}/get", params=params, timeout=10)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.warning("LRCLIB fetch failed: %s", e)
    return {}


def inject_lyrics(filepath: str, artist: str, title: str, album: str = "", duration: float = 0):
    data = fetch_lrclib(artist, title, album, duration)
    if not data:
        return

    plain = data.get("plainLyrics", "")
    synced = data.get("syncedLyrics", "")

    if not plain and not synced:
        return

    try:
        audio = ID3(filepath)
    except MutagenError:
        audio = ID3()

    if synced:
        lines = []
        for line in synced.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            m = re.match(r'^\[(\d+):(\d+\.\d+)\](.*)', line)
            if m:
                minutes = int(m.group(1))
                seconds = float(m.group(2))
                ts = int((minutes * 60 + seconds) * 1000)
                text = m.group(3).strip()
                if text:
                    lines.append((ts, text))
        if lines:
            sync_array = []
            for ts, text in lines:
                sync_array.extend([text.encode("utf-16-be"), ts])
            audio["SYLT"] = SYLT(
                encoding=3,
                lang="eng",
                format=2,
                type=1,
                text=sync_array,
            )

    if plain:
        audio["USLT"] = USLT(
            encoding=3,
            lang="eng",
            desc="",
            text=plain,
        )

    audio.save(filepath)
