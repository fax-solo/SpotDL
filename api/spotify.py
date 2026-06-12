import re
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

URL_PATTERNS = {
    "track": re.compile(r"spotify\.com/track/([a-zA-Z0-9]+)"),
    "album": re.compile(r"spotify\.com/album/([a-zA-Z0-9]+)"),
    "playlist": re.compile(r"spotify\.com/playlist/([a-zA-Z0-9]+)"),
}


def parse_url(url: str) -> tuple[str, str] | None:
    for kind, pattern in URL_PATTERNS.items():
        m = pattern.search(url)
        if m:
            return kind, m.group(1)
    return None


def _scrape_track(track_id: str) -> dict:
    html = requests.get(
        f"https://open.spotify.com/track/{track_id}",
        headers=HEADERS,
        timeout=15,
    ).text

    og_title = re.search(r'<meta[^>]*property="og:title"[^>]*content="([^"]+)"', html)
    og_desc = re.search(r'<meta[^>]*property="og:description"[^>]*content="([^"]+)"', html)
    og_image = re.search(r'<meta[^>]*property="og:image"[^>]*content="([^"]+)"', html)

    title = og_title.group(1) if og_title else "Unknown Track"

    artist = "Unknown Artist"
    album = "Unknown Album"
    if og_desc:
        parts = og_desc.group(1).split(" · ")
        if len(parts) >= 2:
            artist = parts[0]
            album = parts[1]

    artwork = og_image.group(1) if og_image else None

    return {
        "title": title,
        "artist": artist,
        "album": album,
        "artwork_url": artwork,
        "url": f"https://open.spotify.com/track/{track_id}",
        "type": "track",
    }


def _extract_track_ids(html: str) -> list[str]:
    ids = []
    for m in re.finditer(r'<meta[^>]*name="music:song"[^>]*content="([^"]+)"', html):
        tid = re.search(r"/track/([a-zA-Z0-9]+)", m.group(1))
        if tid:
            ids.append(tid.group(1))
    return ids


def _scrape_album(album_id: str) -> list[dict]:
    html = requests.get(
        f"https://open.spotify.com/album/{album_id}",
        headers=HEADERS,
        timeout=15,
    ).text

    track_ids = _extract_track_ids(html)

    if not track_ids:
        return []

    results: list[dict | None] = [None] * len(track_ids)

    with ThreadPoolExecutor(max_workers=10) as pool:
        fut_map = {pool.submit(_scrape_track, tid): i for i, tid in enumerate(track_ids)}
        for fut in as_completed(fut_map):
            idx = fut_map[fut]
            try:
                results[idx] = fut.result()
            except Exception:
                pass

    return [r for r in results if r is not None]


def _scrape_playlist(playlist_id: str) -> list[dict]:
    html = requests.get(
        f"https://open.spotify.com/playlist/{playlist_id}",
        headers=HEADERS,
        timeout=15,
    ).text

    track_ids = _extract_track_ids(html)

    if not track_ids:
        return []

    results: list[dict | None] = [None] * len(track_ids)

    with ThreadPoolExecutor(max_workers=10) as pool:
        fut_map = {pool.submit(_scrape_track, tid): i for i, tid in enumerate(track_ids)}
        for fut in as_completed(fut_map):
            idx = fut_map[fut]
            try:
                results[idx] = fut.result()
            except Exception:
                pass

    return [r for r in results if r is not None]


def fetch_metadata(url: str) -> dict | list[dict]:
    parsed = parse_url(url)
    if not parsed:
        raise ValueError("Could not parse Spotify URL")
    kind, id_ = parsed
    try:
        if kind == "track":
            return _scrape_track(id_)
        elif kind == "album":
            return _scrape_album(id_)
        elif kind == "playlist":
            return _scrape_playlist(id_)
    except requests.RequestException as e:
        raise RuntimeError(f"Failed to fetch Spotify page: {e}")
    except Exception as e:
        raise RuntimeError(str(e))
    raise ValueError(f"Unsupported type: {kind}")
