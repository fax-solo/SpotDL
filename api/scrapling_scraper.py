"""Server-side scraping using Scrapling (anti-bot bypass, TLS fingerprinting).
Falls back gracefully if Scrapling is not installed."""

import re
import json
import logging
import urllib.parse
import urllib.request

logger = logging.getLogger(__name__)

_SCRAPLING_AVAILABLE = False
Fetcher = None
Selector = None

try:
    from scrapling.fetchers import Fetcher as _Fetcher
    from scrapling.parser import Selector as _Selector

    Fetcher = _Fetcher
    Selector = _Selector
    _SCRAPLING_AVAILABLE = True
    logger.info("Scrapling is available — using anti-bot scraping")
except ImportError:
    logger.warning("Scrapling not installed — lyrics, Bandcamp, and SoundCloud functions will silently return empty. Install with: pip install scrapling")


def is_available() -> bool:
    if not _SCRAPLING_AVAILABLE:
        logger.debug("Scrapling not available — skipping scraping operation")
    return _SCRAPLING_AVAILABLE


# ─── Genius Lyrics ───


def _genius_slugify(text: str) -> str:
    return re.sub(r'[^\w\s-]', '', text.lower()).strip().replace(' ', '-')


def _scrape_genius(artist: str, title: str) -> str | None:
    if not is_available():
        return None
    slug = f"{_genius_slugify(artist)}-{_genius_slugify(title)}"
    urls_to_try = [
        f"https://genius.com/{slug}-lyrics",
        f"https://genius.com/{_genius_slugify(artist)}-{_genius_slugify(re.sub(r'\([^)]*\)', '', title).strip())}-lyrics",
    ]
    for url in urls_to_try:
        try:
            page = Fetcher.get(url, impersonate='chrome', stealthy_headers=True, timeout=12)
            lyrics = ""
            containers = page.css('[data-lyrics-container="true"]')
            if not containers:
                containers = page.css('div[class*="Lyrics"]')
            for container in containers:
                lyrics += container.get_all_text() + "\n"
            lyrics = lyrics.strip()
            if lyrics and len(lyrics) > 20:
                logger.info(f"Scrapling: Got Genius lyrics for {artist} - {title}")
                return lyrics
        except Exception as e:
            logger.debug(f"Scrapling: Genius failed for {url}: {e}")
    return None


# ─── MusixMatch Lyrics ───


def _scrape_musixmatch(artist: str, title: str) -> str | None:
    if not is_available():
        return None
    url = f"https://www.musixmatch.com/lyrics/{_genius_slugify(artist)}/{_genius_slugify(title)}"
    try:
        page = Fetcher.get(url, impersonate='chrome', stealthy_headers=True, timeout=12)
        content = page.css('.mxm-lyrics__content')
        if not content:
            content = page.css('p[class*="mxm-lyrics"]')
        if not content:
            content = page.css('.lyrics__content')
        lyrics = "\n".join(c.get_all_text() for c in content if c.get_all_text())
        if lyrics.strip() and len(lyrics.strip()) > 20:
            logger.info(f"Scrapling: Got MusixMatch lyrics for {artist} - {title}")
            return lyrics.strip()
    except Exception as e:
        logger.debug(f"Scrapling: MusixMatch failed: {e}")
    return None


def fetch_lyrics(artist: str, title: str) -> dict | None:
    lyrics = _scrape_genius(artist, title) or _scrape_musixmatch(artist, title)
    if lyrics:
        return {"plainLyrics": lyrics, "syncedLyrics": None}
    return None


# ─── Bandcamp ───


def search_bandcamp(query: str) -> list[dict]:
    if not is_available():
        return []
    try:
        url = f"https://bandcamp.com/search?q={urllib.parse.quote(query)}&item_type=t"
        page = Fetcher.get(url, impersonate='chrome', stealthy_headers=True, timeout=15)
        html = page.body.decode("utf-8", errors="replace")
        results = []
        for m in re.finditer(
            r'<a href="(https://[^"]+\.bandcamp\.com/track/[^"]+)"[^>]*>(.*?)</a>',
            html, re.DOTALL,
        ):
            track_url = m.group(1).replace('&amp;', '&')
            title = re.sub(r'<[^>]+>', '', m.group(2)).strip()
            if title and not any(r['url'] == track_url for r in results):
                results.append({"url": track_url, "title": title, "artist": "", "source": "bandcamp"})
        return results[:5]
    except Exception as e:
        logger.warning(f"Scrapling: Bandcamp search failed: {e}")
        return []


def bandcamp_info(track_url: str) -> dict | None:
    if not is_available():
        return None
    try:
        page = Fetcher.get(track_url, impersonate='chrome', stealthy_headers=True, timeout=15)
        html = page.body.decode("utf-8", errors="replace")

        tralbum_match = re.search(r'data-tralbum="([^"]+)"', html)
        if tralbum_match:
            try:
                raw = tralbum_match.group(1)
                raw = raw.replace('&quot;', '"').replace('&#x27;', "'").replace('&amp;', '&')
                data = json.loads(raw)
                track = (data.get('trackinfo') or [{}])[0]
                audio_url = (
                    (track.get('file') or {}).get('mp3-128')
                    or (track.get('file') or {}).get('aac-hi')
                    or None
                )
                if audio_url:
                    audio_url = audio_url.replace('\\/', '/').replace('&amp;', '&')
                    return {
                        "title": track.get('title') or _og_title(html) or 'Unknown',
                        "author": data.get('artist') or _og_author(html) or 'Unknown',
                        "duration": str(track.get('duration', 0)),
                        "audioUrl": audio_url,
                        "thumbnail": data.get('artThumbnailURL') or data.get('artFullsizeURL') or _og_image(html),
                    }
            except json.JSONDecodeError:
                pass

        audio_url = _og_audio(html) or _inline_audio(html)
        if audio_url:
            return {
                "title": _og_title(html) or 'Unknown',
                "author": _og_author(html) or 'Unknown',
                "duration": "0",
                "audioUrl": audio_url,
                "thumbnail": _og_image(html),
            }
    except Exception as e:
        logger.warning(f"Scrapling: Bandcamp info failed: {e}")
    return None


# ─── SoundCloud ───


def _extract_soundcloud_cid() -> str | None:
    if not is_available():
        return None
    try:
        page = Fetcher.get('https://soundcloud.com/', impersonate='chrome', stealthy_headers=True, timeout=12)
        html = page.body.decode("utf-8", errors="replace")
        m = re.search(r'"apiClient","data":\{"id":"([^"]+)"', html)
        if m:
            return m.group(1)
        m = re.search(r'client_id["\s:=]+"([a-f0-9]+)"', html)
        return m.group(1) if m else None
    except Exception as e:
        logger.warning(f"Scrapling: SoundCloud client ID extraction failed: {e}")
        return None


SOUNDCLOUD_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
}


def search_soundcloud(query: str) -> list[dict]:
    if not is_available():
        return []
    cid = _extract_soundcloud_cid()
    if not cid:
        return []
    try:
        req = urllib.request.Request(
            f'https://api-v2.soundcloud.com/search/tracks?q={urllib.parse.quote(query)}&client_id={cid}&limit=5',
            headers=SOUNDCLOUD_HEADERS,
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        results = []
        for t in (data.get('collection') or []):
            results.append({
                "url": t.get('permalink_url') or f"https://soundcloud.com/{t['user']['permalink']}/{t['permalink']}",
                "title": t.get('title', 'Unknown'),
                "artist": t.get('user', {}).get('username', 'Unknown'),
                "duration": str((t.get('duration', 0) or 0) // 1000),
                "audioUrl": None,
                "thumbnail": (t.get('artwork_url') or '').replace('-large.', '-t500x500.') or None,
                "source": "soundcloud",
            })
        return results
    except Exception as e:
        logger.warning(f"Scrapling: SoundCloud search failed: {e}")
        return []


def soundcloud_info(track_url: str) -> dict | None:
    if not is_available():
        return None
    path_match = re.search(r'soundcloud\.com(/[^?#]+)', track_url)
    if not path_match:
        return None
    path = path_match.group(1).rstrip('/')
    cid = _extract_soundcloud_cid()
    if not cid:
        return None
    try:
        req = urllib.request.Request(
            f'https://api-v2.soundcloud.com/resolve?url=https://soundcloud.com{path}&client_id={cid}',
            headers=SOUNDCLOUD_HEADERS,
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            track = json.loads(resp.read())

        audio_url = None
        if track.get('downloadable') and track.get('download_url'):
            dl_req = urllib.request.Request(
                f"{track['download_url']}?client_id={cid}",
                headers=SOUNDCLOUD_HEADERS,
            )
            try:
                opener = urllib.request.build_opener()
                opener.open(dl_req)
                audio_url = opener.redirected
            except Exception:
                pass

        if not audio_url and track.get('media', {}).get('transcodings'):
            transcodings = track['media']['transcodings']
            preferred = next(
                (t for t in transcodings if t.get('format', {}).get('protocol') == 'progressive'
                 and 'audio/mpeg' in (t.get('format', {}).get('mime_type', ''))),
                next(
                    (t for t in transcodings if t.get('format', {}).get('protocol') == 'progressive'),
                    transcodings[0],
                ),
            )
            if preferred:
                stream_req = urllib.request.Request(
                    f"{preferred['url']}?client_id={cid}",
                    headers=SOUNDCLOUD_HEADERS,
                )
                with urllib.request.urlopen(stream_req, timeout=10) as resp:
                    stream_data = json.loads(resp.read())
                    audio_url = stream_data.get('url') or None

        return {
            "title": track.get('title', 'Unknown'),
            "author": (track.get('user') or {}).get('username', 'Unknown'),
            "duration": str((track.get('duration', 0) or 0) // 1000),
            "audioUrl": audio_url,
            "thumbnail": (track.get('artwork_url') or '').replace('-large.', '-t500x500.') or None,
        }
    except Exception as e:
        logger.warning(f"Scrapling: SoundCloud info failed: {e}")
        return None


# ─── Helpers ───


def _og_title(html: str) -> str | None:
    m = re.search(r'<meta\s+property="og:title"\s+content="([^"]+)"', html)
    return m.group(1) if m else None


def _og_author(html: str) -> str | None:
    m = re.search(r'<meta\s+name="author"\s+content="([^"]+)"', html)
    return m.group(1) if m else None


def _og_image(html: str) -> str | None:
    m = re.search(r'<meta\s+property="og:image"\s+content="([^"]+)"', html)
    return m.group(1) if m else None


def _og_audio(html: str) -> str | None:
    m = re.search(r'<meta\s+property="og:audio"\s+content="([^"]+)"', html)
    return m.group(1) if m else None


def _inline_audio(html: str) -> str | None:
    m = re.search(r'"mp3-128":"([^"]+)"', html)
    if m:
        return m.group(1).replace('\\/', '/').replace('&amp;', '&')
    m = re.search(r'"aac-hi":"([^"]+)"', html)
    if m:
        return m.group(1).replace('\\/', '/').replace('&amp;', '&')
    return None
