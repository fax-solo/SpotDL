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


# ---------------------------------------------------------------------------
# Authentication  –  cookies.txt (exported from browser extension)
#
# Locally: place cookies.txt in the project root or api/ directory.
# On Vercel: base64-encode the file and set as YT_DLP_COOKIES env var.
# ---------------------------------------------------------------------------

def _copy_to_writable(src: str) -> str:
    """Copy cookies to writable temp so yt-dlp's MozillaCookieJar can save."""
    dst = os.path.join(tempfile.gettempdir(), "cookies.txt")
    shutil.copy2(src, dst)
    os.chmod(dst, 0o600)
    return dst


def _resolve_cookies() -> dict:
    """Return yt-dlp cookiefile opts, checking multiple sources."""

    # 1. Base64-encoded cookie content from env var (for Vercel)
    env = os.environ.get("YT_DLP_COOKIES")
    if env:
        dst = os.path.join(tempfile.gettempdir(), "cookies.txt")
        try:
            import base64
            content = base64.b64decode(env).decode("utf-8")
        except Exception:
            content = env
        with open(dst, "w") as f:
            f.write(content)
        logger.info("Using cookies from YT_DLP_COOKIES env var")
        return {"cookiefile": dst}

    # 2. cookies.txt in api/ or project root (always copy to /tmp/ for writability)
    for d in (os.path.dirname(__file__), os.path.join(os.path.dirname(__file__), "..")):
        path = os.path.normpath(os.path.join(d, "cookies.txt"))
        if os.path.isfile(path):
            dst = _copy_to_writable(path)
            logger.info("Using cookies file (copied to %s)", dst)
            return {"cookiefile": dst}

    logger.warning("No cookies found — YouTube may block downloads")
    return {}


# curl-cffi provides TLS fingerprint impersonation (mimics a real browser handshake)
try:
    from yt_dlp.networking.impersonate import ImpersonateTarget
    _IMPERSONATE = ImpersonateTarget(client="chrome")
except ImportError:
    _IMPERSONATE = None

def _get_base_opts() -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "source_address": "0.0.0.0",
        "extractor_retries": 3,
        "retries": 5,
        "throttled_rate": "100K",
        **_resolve_cookies(),
    }
    if _IMPERSONATE:
        opts["impersonate"] = _IMPERSONATE
    return opts


def _find_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def search_youtube(query: str) -> str | None:
    opts = {
        **_get_base_opts(),
        "extract_flat": True,
        "default_search": "ytsearch1",
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
) -> tuple[str, str]:
    query = f"{artist} {title} official audio"
    youtube_url = search_youtube(query)
    if not youtube_url:
        raise RuntimeError(f"No YouTube video found for '{title}' by {artist}")

    tmpdir = tempfile.mkdtemp()
    safe_name = f"{_safe(artist)} - {_safe(title)}"
    outtmpl = os.path.join(tmpdir, f"{safe_name}.%(ext)s")

    ffmpeg_available = _find_ffmpeg()

    if ffmpeg_available:
        opts = {
            **_get_base_opts(),
            "extractor_args": {"youtube": {"skip": ["dash", "hls"]}},
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
            "extractor_args": {"youtube": {"skip": ["dash", "hls"]}},
            "format": "bestaudio[ext=m4a]/bestaudio",
            "outtmpl": outtmpl,
        }

    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([youtube_url])

    files = os.listdir(tmpdir)
    if not files:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise RuntimeError("No files downloaded")

    filepath = os.path.join(tmpdir, files[0])
    ext = os.path.splitext(filepath)[1].lower()

    if ext == ".mp3":
        _tag_mp3(filepath, title, artist, album, artwork_url)
    elif ext == ".m4a":
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
