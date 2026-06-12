import re
import json
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"}

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


def _fetch_embed_data(kind: str, spotify_id: str) -> dict:
    url = f"https://open.spotify.com/embed/{kind}/{spotify_id}"
    resp = requests.get(url, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    html = resp.text

    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>', html)
    if not m:
        raise RuntimeError("Could not find Spotify embed state data")

    data = json.loads(m.group(1))
    try:
        return data["props"]["pageProps"]["state"]["data"]["entity"]
    except KeyError:
        raise RuntimeError("Unexpected Spotify embed JSON structure")


def _extract_image_url(entity: dict) -> str | None:
    try:
        sources = entity.get("coverArt", {}).get("sources", [])
        if sources:
            # Get the highest resolution image
            sources.sort(key=lambda s: s.get("width") or 0, reverse=True)
            return sources[0].get("url")
    except Exception:
        pass
    return None


def _scrape_track(track_id: str) -> dict:
    entity = _fetch_embed_data("track", track_id)
    
    title = entity.get("title", "Unknown Track")
    artist = entity.get("subtitle", "Unknown Artist")
    artwork = _extract_image_url(entity)

    # Note: Embed API for tracks doesn't explicitly separate Album name,
    # it provides it as part of context if available.
    
    return {
        "title": title,
        "artist": artist,
        "album": "Single", # Default fallback
        "artwork_url": artwork,
        "url": f"https://open.spotify.com/track/{track_id}",
        "type": "track",
    }


def _scrape_collection(kind: str, collection_id: str) -> list[dict]:
    entity = _fetch_embed_data(kind, collection_id)
    
    collection_name = entity.get("title", "Unknown Album/Playlist")
    collection_artwork = _extract_image_url(entity)
    
    track_list = entity.get("trackList", [])
    
    tracks = []
    for item in track_list:
        uri = item.get("uri", "")
        if not uri.startswith("spotify:track:"):
            continue
            
        tid = uri.split(":")[-1]
        
        # In a playlist, the cover art might differ per track, but the embed payload
        # often only supplies the global coverArt.
        tracks.append({
            "title": item.get("title", "Unknown Track"),
            "artist": item.get("subtitle", "Unknown Artist"),
            "album": collection_name if kind == "album" else "Unknown Album",
            "artwork_url": collection_artwork,
            "url": f"https://open.spotify.com/track/{tid}",
            "type": "track",
        })

    return tracks


def fetch_metadata(url: str) -> dict | list[dict]:
    parsed = parse_url(url)
    if not parsed:
        raise ValueError("Could not parse Spotify URL")
    
    kind, id_ = parsed
    try:
        if kind == "track":
            return _scrape_track(id_)
        elif kind in ("album", "playlist"):
            return _scrape_collection(kind, id_)
    except requests.RequestException as e:
        raise RuntimeError(f"Failed to fetch Spotify page: {e}")
    except Exception as e:
        raise RuntimeError(str(e))
        
    raise ValueError(f"Unsupported type: {kind}")
