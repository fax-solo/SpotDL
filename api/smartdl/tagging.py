import logging
from io import BytesIO

import httpx
from mutagen.id3 import ID3, TIT2, TPE1, TALB, APIC, error as MutagenError

try:
    from PIL import Image, ImageOps
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

logger = logging.getLogger("smartdl.tagging")

MIN_COVER_SIZE = 640


def _download_cover(cover_art_url: str) -> bytes | None:
    if not cover_art_url:
        return None
    try:
        resp = httpx.get(cover_art_url, timeout=15)
        if resp.status_code != 200 or len(resp.content) < 100:
            return None
        raw = resp.content
        if not HAS_PIL:
            return raw
        img = Image.open(BytesIO(raw))
        w, h = img.size
        if w < MIN_COVER_SIZE or h < MIN_COVER_SIZE:
            logger.info("Cover too small (%dx%d), upscaling to %dpx", w, h, MIN_COVER_SIZE)
            img = ImageOps.fit(img, (MIN_COVER_SIZE, MIN_COVER_SIZE), Image.LANCZOS)
        if img.mode != "RGB":
            img = img.convert("RGB")
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=92)
        return buf.getvalue()
    except Exception as e:
        logger.warning("Cover download/process failed: %s", e)
        return None


def tag_mp3(filepath: str, title: str, artist: str, album: str, cover_data: bytes | None = None):
    try:
        audio = ID3(filepath)
    except MutagenError:
        audio = ID3()
    audio["TIT2"] = TIT2(encoding=3, text=title)
    audio["TPE1"] = TPE1(encoding=3, text=artist)
    audio["TALB"] = TALB(encoding=3, text=album)
    if cover_data:
        audio["APIC"] = APIC(
            encoding=3,
            mime="image/jpeg",
            type=3,
            desc="Cover",
            data=cover_data,
        )
    audio.save(filepath)
