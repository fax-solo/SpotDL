import os
import re
import shutil
import tempfile
import logging
import asyncio

import yt_dlp

from smartdl import resolver
from smartdl import piped_client
from smartdl import audius_client
from smartdl import invidious_client

logger = logging.getLogger("smartdl.audio")

def _get_base_opts() -> dict:
    opts = {
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
    cookie_file = os.environ.get("YTDLP_COOKIE_FILE", "")
    if cookie_file and os.path.isfile(cookie_file):
        opts["cookiefile"] = cookie_file
    return opts

YTDL_BASE_OPTS = _get_base_opts()


def _safe_filename(s: str) -> str:
    return re.sub(r'[^\w\-_., ]', "_", s)


def _find_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def _normalize(s: str) -> str:
    return re.sub(r'\([^)]*\)|\[[^\]]*\]', '', s.lower()).strip()


def _title_matches(title: str, artist: str, found_title: str | None, found_uploader: str | None = None) -> bool:
    if not found_title:
        return False
    t = _normalize(title)
    a = _normalize(artist) if artist else ""
    ft = _normalize(found_title)
    fu = _normalize(found_uploader) if found_uploader else ""
    t_tokens = set(t.split())
    ft_tokens = set(ft.split())
    overlap = len(t_tokens & ft_tokens)
    if t and overlap < max(1, len(t_tokens) * 0.4):
        if t not in ft:
            return False
    if not a:
        return True
    if a in ft or a in fu:
        return True
    a_tokens = set(a.split())
    fu_tokens = set(fu.split())
    if a_tokens and fu_tokens and len(a_tokens & fu_tokens) >= len(a_tokens) * 0.5:
        return True
    return False


def _ytdl_download(track_url: str, quality: str, tmpdir: str, safe_name: str) -> tuple[str, str]:
    ffmpeg_available = _find_ffmpeg()
    outtmpl = os.path.join(tmpdir, f"{safe_name}.%(ext)s")
    opts = {**YTDL_BASE_OPTS, "outtmpl": outtmpl}
    if ffmpeg_available:
        opts["format"] = "bestaudio/best"
        opts["postprocessors"] = [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
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

    logger.info("ytdl_download: downloading %s", track_url)
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([track_url])

    files = [f for f in os.listdir(tmpdir) if not f.endswith(".part")]
    if not files:
        raise RuntimeError("No output files after download")

    files.sort()
    ext_expected = "mp3" if ffmpeg_available else "m4a"
    expected = f"{safe_name}.{ext_expected}"
    filepath = os.path.join(tmpdir, expected if expected in files else files[0])
    ext = os.path.splitext(filepath)[1].lower()
    return filepath, ext


def _ytdl_search(prefix: str, query: str) -> list[dict]:
    opts = {**YTDL_BASE_OPTS, "extract_flat": False, "default_search": prefix}
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
            return entries
    except Exception as e:
        logger.warning("ytdl_search(%s) failed: %s", prefix, e)
        return []


async def _soundcloud_step(artist: str, title: str) -> tuple[str | None, str | None, str | None]:
    query = f"{artist} - {title}"
    results = await resolver.search_soundcloud(query)
    if not results:
        return None, None, None
    for result in results:
        if _title_matches(title, artist, result.get("title"), result.get("uploader")):
            stream_url = result.get("stream_url")
            if stream_url:
                final_url = await resolver.resolve_soundcloud_stream(result["url"])
                if final_url:
                    return final_url, "soundcloud", result["url"]
    return None, None, None


async def download_audio(artist: str, title: str, quality: str = "256") -> tuple[str, str, str]:
    safe_name = f"{_safe_filename(artist)} - {_safe_filename(title)}"
    track_url = None
    source_name = None

    logger.info("download_audio: phase 1 — YouTube Music Topic")
    entries = await asyncio.to_thread(
        _ytdl_search, "ytsearch1", f"{artist} - {title} Topic",
    )
    for entry in entries:
        if _title_matches(title, artist, entry.get("title"), entry.get("uploader")):
            track_url = entry["url"]
            source_name = "youtube_music"
            break
    if not track_url:
        for entry in entries:
            if entry.get("url"):
                track_url = entry["url"]
                source_name = "youtube_music"
                break

    if not track_url:
        logger.info("download_audio: phase 2 — SoundCloud via resolver")
        track_url, source_name, _ = await _soundcloud_step(artist, title)

    if not track_url:
        logger.info("download_audio: phase 3 — Standard YouTube")
        entries = await asyncio.to_thread(
            _ytdl_search, "ytsearch1", f"{artist} - {title}",
        )
        for entry in entries:
            if _title_matches(title, artist, entry.get("title"), entry.get("uploader")):
                track_url = entry["url"]
                source_name = "youtube"
                break

    if not track_url:
        logger.info("download_audio: phase 4 — Piped API fallback")
        piped_url = await piped_client.piped_get_audio_url(artist, title)
        if piped_url:
            track_url = piped_url
            source_name = "piped"

    if not track_url:
        logger.info("download_audio: phase 5 — Audius free music catalog")
        audius_url = await audius_client.audius_get_audio_url(artist, title)
        if audius_url:
            track_url = audius_url
            source_name = "audius"

    if not track_url:
        logger.info("download_audio: phase 6 — Invidious YouTube fallback")
        results = await invidious_client.invidious_search(f"{artist} - {title}", limit=3)
        for r in results:
            vid = r.get("videoId")
            if not vid:
                continue
            audio_url = await invidious_client.invidious_get_audio_url(vid)
            if audio_url:
                track_url = audio_url
                source_name = "invidious"
                break

    if not track_url:
        raise RuntimeError(
            f"No playable source found for '{title}' by {artist}. "
            f"Tried YouTube Music (Topic), SoundCloud, YouTube, Piped, Audius, and Invidious."
        )

    tmpdir = tempfile.mkdtemp()
    try:
        filepath, ext = await asyncio.to_thread(
            _ytdl_download, track_url, quality, tmpdir, safe_name,
        )
        return filepath, ext, tmpdir
    except Exception:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise
