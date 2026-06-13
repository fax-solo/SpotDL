import os
import re
import json
import base64
import requests
import yt_dlp
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


def _scrape_collection(kind: str, collection_id: str) -> dict:
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

    return {
        "collection_name": collection_name,
        "collection_artwork": collection_artwork,
        "collection_type": kind,
        "tracks": tracks,
    }


def _get_spotify_token() -> str | None:
    client_id = os.environ.get("SPOTIFY_CLIENT_ID")
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None

    auth_string = f"{client_id}:{client_secret}"
    auth_b64 = base64.b64encode(auth_string.encode("utf-8")).decode("utf-8")
    headers = {
        "Authorization": f"Basic {auth_b64}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    data = {"grant_type": "client_credentials"}
    
    resp = requests.post("https://accounts.spotify.com/api/token", headers=headers, data=data, timeout=10)
    if resp.status_code == 200:
        return resp.json().get("access_token")
    else:
        raise RuntimeError(f"Spotify API Key Error: Please check your SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET. Spotify says: {resp.text}")


def _fetch_official_track(track_id: str, token: str) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"https://api.spotify.com/v1/tracks/{track_id}", headers=headers, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    
    artwork = None
    if data.get("album", {}).get("images"):
        artwork = data["album"]["images"][0]["url"]
        
    return {
        "title": data.get("name", "Unknown Track"),
        "artist": ", ".join(a["name"] for a in data.get("artists", [])),
        "album": data.get("album", {}).get("name", "Single"),
        "artwork_url": artwork,
        "url": data["external_urls"]["spotify"],
        "type": "track",
    }


def _fetch_official_collection(kind: str, collection_id: str, token: str) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    
    # Fetch collection details
    coll_resp = requests.get(f"https://api.spotify.com/v1/{kind}s/{collection_id}", headers=headers, timeout=10)
    coll_resp.raise_for_status()
    coll_data = coll_resp.json()
    
    collection_name = coll_data.get("name", "Unknown Album/Playlist")
    collection_artwork = None
    if coll_data.get("images"):
        collection_artwork = coll_data["images"][0]["url"]
        
    tracks = []
    
    # Pagination
    url = f"https://api.spotify.com/v1/{kind}s/{collection_id}/tracks?limit=100"
    while url:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        
        for item in data.get("items", []):
            track = item.get("track") if kind == "playlist" else item
            if not track or not track.get("id"):
                continue
                
            track_artwork = collection_artwork
            if kind == "playlist" and track.get("album", {}).get("images"):
                track_artwork = track["album"]["images"][0]["url"]
                
            tracks.append({
                "title": track.get("name", "Unknown Track"),
                "artist": ", ".join(a["name"] for a in track.get("artists", [])),
                "album": track.get("album", {}).get("name", collection_name if kind == "album" else "Unknown Album"),
                "artwork_url": track_artwork,
                "url": track.get("external_urls", {}).get("spotify", f"https://open.spotify.com/track/{track['id']}"),
                "type": "track",
            })
            
        url = data.get("next")
        
    return {
        "collection_name": collection_name,
        "collection_artwork": collection_artwork,
        "collection_type": kind,
        "tracks": tracks,
    }


def _fetch_generic_metadata(url: str) -> dict:
    opts = {
        "extract_flat": True,
        "quiet": True,
        "no_warnings": True,
        "extractor_args": {"youtube": {"client": ["android", "ios"]}}
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        
        if not info:
            raise ValueError("Could not extract metadata from this URL")

        if "entries" in info:
            tracks = []
            collection_name = info.get("title", "Unknown Playlist")
            collection_artwork = None
            if info.get("thumbnails"):
                collection_artwork = info["thumbnails"][-1].get("url")
            
            for entry in info["entries"]:
                if not entry:
                    continue
                artwork = None
                if entry.get("thumbnails"):
                    artwork = entry["thumbnails"][-1].get("url")
                
                tracks.append({
                    "title": entry.get("title", "Unknown Track"),
                    "artist": entry.get("uploader", entry.get("channel", "Unknown Artist")),
                    "album": collection_name,
                    "artwork_url": artwork,
                    "url": entry.get("url") or entry.get("webpage_url", url),
                    "type": "track"
                })
            return {
                "collection_name": collection_name,
                "collection_artwork": collection_artwork,
                "collection_type": "playlist",
                "tracks": tracks,
            }
        else:
            artwork = None
            if info.get("thumbnails"):
                artwork = info["thumbnails"][-1].get("url")
                
            return {
                "title": info.get("title", "Unknown Track"),
                "artist": info.get("uploader", info.get("channel", "Unknown Artist")),
                "album": "Single",
                "artwork_url": artwork,
                "url": info.get("webpage_url", url),
                "type": "track"
            }


def fetch_metadata(url: str) -> dict | list[dict]:
    parsed = parse_url(url)
    if not parsed:
        # If it's not a Spotify URL, try extracting via yt-dlp (supports YT, SC, etc.)
        try:
            return _fetch_generic_metadata(url)
        except Exception as e:
            raise ValueError(f"Could not parse URL. Ensure it is a valid Spotify, YouTube, or SoundCloud link. ({e})")
    
    kind, id_ = parsed
    
    token = _get_spotify_token()
    
    try:
        if token:
            try:
                if kind == "track":
                    return _fetch_official_track(id_, token)
                elif kind in ("album", "playlist"):
                    return _fetch_official_collection(kind, id_, token)
            except requests.exceptions.HTTPError as e:
                # If 403/404, it might be a private playlist. Fallback to embed scraper!
                if e.response.status_code in (403, 404):
                    pass
                else:
                    raise e
                    
        # Fallback to embed scraper (either no token, or official API was forbidden)
        if kind == "track":
            return _scrape_track(id_)
        elif kind in ("album", "playlist"):
            return _scrape_collection(kind, id_)
            
    except requests.RequestException as e:
        raise RuntimeError(f"Failed to fetch Spotify page/API: {e}")
    except Exception as e:
        raise RuntimeError(str(e))
        
    raise ValueError(f"Unsupported type: {kind}")
