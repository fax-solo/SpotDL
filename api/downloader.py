import glob
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


def _config_home() -> str:
    return os.environ.get("XDG_CONFIG_HOME", os.path.expanduser("~/.config"))


def _has_firefox_cookies() -> bool:
    roots = [
        os.path.join(_config_home(), "mozilla/firefox"),
        os.path.expanduser("~/.mozilla/firefox"),
        os.path.expanduser("~/.var/app/org.mozilla.firefox/config/mozilla/firefox"),
        os.path.expanduser("~/.var/app/org.mozilla.firefox/.mozilla/firefox"),
        os.path.expanduser("~/snap/firefox/common/.mozilla/firefox"),
    ]
    for root in roots:
        pattern = os.path.join(root, "*", "cookies.sqlite")
        for path in glob.iglob(pattern):
            if os.path.isfile(path) and os.path.getsize(path) > 0:
                return True
    return False


def _has_chrome_cookies() -> bool:
    config = _config_home()
    chromium_browsers = {
        "chrome": "google-chrome",
        "chromium": "chromium",
        "edge": "microsoft-edge",
        "brave": "BraveSoftware/Brave-Browser",
        "vivaldi": "vivaldi",
        "opera": "opera",
    }
    for name, subdir in chromium_browsers.items():
        browser_dir = os.path.join(config, subdir)
        for pattern in ("*/Cookies", "Cookies"):
            for path in glob.iglob(os.path.join(browser_dir, pattern)):
                if os.path.isfile(path) and os.path.getsize(path) > 0:
                    return True
    return False


def _get_cookie_opts() -> dict:
    env_file = os.environ.get("YT_DLP_COOKIES_FILE")
    if env_file and os.path.isfile(env_file):
        logger.info("Using cookies file from env: %s", env_file)
        return {"cookiefile": env_file}

    if _has_firefox_cookies():
        logger.info("Using cookies from firefox")
        return {"cookiesfrombrowser": ("firefox",)}

    if _has_chrome_cookies():
        logger.info("Using cookies from chrome")
        return {"cookiesfrombrowser": ("chrome",)}

    cookies_file = os.path.join(os.path.dirname(__file__), "cookies.txt")
    if os.path.isfile(cookies_file):
        logger.info("Using cookies file: %s", cookies_file)
        return {"cookiefile": cookies_file}

    logger.warning("No browser cookies or cookies.txt found")
    return {}


_COOKIE_OPTS: dict = _get_cookie_opts()

_EXTRACTOR_ARGS = {
    "youtube": {
        "skip": ["dash", "hls"],
        "player_client": ["android", "web"],
    },
}

_BASE_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "source_address": "0.0.0.0",
    "extractor_args": _EXTRACTOR_ARGS,
    "extractor_retries": 3,
    "retries": 5,
    "throttled_rate": "100K",
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
}


def _find_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def search_youtube(query: str) -> str | None:
    opts = {
        **_BASE_OPTS,
        "extract_flat": True,
        "default_search": "ytsearch1",
        **_COOKIE_OPTS,
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
            **_BASE_OPTS,
            "format": "bestaudio/best",
            "outtmpl": outtmpl,
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "320",
                }
            ],
            **_COOKIE_OPTS,
        }
    else:
        opts = {
            **_BASE_OPTS,
            "format": "bestaudio[ext=m4a]/bestaudio",
            "outtmpl": outtmpl,
            **_COOKIE_OPTS,
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
