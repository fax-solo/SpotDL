import os
import re
import json
import base64
import time
import threading
import logging
import urllib.parse
from pathlib import Path

logger = logging.getLogger(__name__)

_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    for _line in _env_path.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from cryptography.fernet import Fernet
from shared import requests_retry_session, get_circuit_breaker, source_is_open

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"}

_session = requests_retry_session()

URL_PATTERNS = {
    "track": re.compile(r"spotify\.com/track/([a-zA-Z0-9]+)"),
    "album": re.compile(r"spotify\.com/album/([a-zA-Z0-9]+)"),
    "playlist": re.compile(r"spotify\.com/playlist/([a-zA-Z0-9]+)"),
}

# Spotify's public embed endpoint delivers at most this many tracks per collection.
EMBED_MAX_TRACKS = 100


def parse_url(url: str) -> tuple[str, str] | None:
    for kind, pattern in URL_PATTERNS.items():
        m = pattern.search(url)
        if m:
            return kind, m.group(1)
    return None


def _fetch_embed_data(kind: str, spotify_id: str) -> dict:
    cb_name = f"spotify_embed_{kind}"
    if source_is_open(cb_name):
        raise RuntimeError(f"Spotify embed {kind} circuit is open — skipping")
    url = f"https://open.spotify.com/embed/{kind}/{spotify_id}"
    try:
        resp = _session.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except Exception:
        get_circuit_breaker(cb_name).record_failure()
        raise

    get_circuit_breaker(cb_name).record_success()
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

    return {
        "title": title,
        "artist": artist,
        "album": "Single",
        "artwork_url": artwork,
        "url": f"https://open.spotify.com/track/{track_id}",
        "type": "track",
    }


def _extract_track_image(item: dict) -> str | None:
    for path in ("coverArt", "albumOfTrack", "album"):
        sub = item.get(path)
        if isinstance(sub, dict):
            try:
                sources = sub.get("coverArt", sub).get("sources", [])
                if not sources and "coverArt" in sub:
                    sources = sub["coverArt"].get("sources", [])
                if sources:
                    sources.sort(key=lambda s: s.get("width") or 0, reverse=True)
                    return sources[0].get("url")
            except Exception as e:
                logger.debug("_extract_track_image coverArt fallback: %s", e)
                continue

    # Direct field checks
    for field in ("image", "thumbnail", "artwork_url"):
        try:
            val = item.get(field)
            if val:
                return val
        except Exception as e:
            logger.debug("_extract_track_image field '%s': %s", field, e)

    # images array
    try:
        images = item.get("images") or []
        if images and isinstance(images, list):
            images.sort(key=lambda i: i.get("width") or i.get("height") or 0, reverse=True)
            return images[0].get("url")
    except Exception as e:
        logger.debug("_extract_track_image images array: %s", e)

    # album sub-object
    try:
        album = item.get("albumOfTrack") or item.get("album")
        if isinstance(album, dict):
            if album.get("images"):
                imgs = album["images"]
                if isinstance(imgs, list) and imgs[0].get("url"):
                    return imgs[0]["url"]
            if album.get("image"):
                return album["image"]
    except Exception as e:
        logger.debug("_extract_track_image album sub-object: %s", e)

    return None


def _extract_track_album(item: dict) -> str | None:
    for path in ("album", "albumOfTrack"):
        sub = item.get(path)
        if isinstance(sub, dict):
            name = sub.get("name")
            if name:
                return name
    return None


def _scrape_collection(kind: str, collection_id: str) -> dict:
    entity = _fetch_embed_data(kind, collection_id)

    collection_name = entity.get("title", "Unknown Album/Playlist")
    collection_artwork = _extract_image_url(entity)

    track_list = entity.get("trackList", [])

    truncated = len(track_list) >= EMBED_MAX_TRACKS
    if truncated:
        logger.warning(
            "Spotify embed returned %d tracks — results may be truncated. "
            "Set up SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET or use OAuth login for full collection access.",
            len(track_list),
        )

    tracks = []
    for item in track_list:
        uri = item.get("uri", "")
        if not uri.startswith("spotify:track:"):
            continue

        tid = uri.split(":")[-1]

        per_track_artwork = _extract_track_image(item)
        per_track_album = _extract_track_album(item)

        album = (
            per_track_album
            if per_track_album
            else (collection_name if kind == "album" else "Unknown Album")
        )

        tracks.append({
            "title": item.get("title", "Unknown Track"),
            "artist": item.get("subtitle", "Unknown Artist"),
            "album": album,
            "artwork_url": per_track_artwork,
            "url": f"https://open.spotify.com/track/{tid}",
            "type": "track",
        })

    return {
        "collection_name": collection_name,
        "collection_artwork": collection_artwork,
        "collection_type": kind,
        "truncated": truncated,
        "total_count": None if truncated else len(tracks),
        "tracks": tracks,
    }


# ─── Encrypted token store ───

_user_auth: dict = {
    "access_token": None,
    "refresh_token": None,
    "expires_at": 0,
}

_token_lock = threading.Lock()

TOKEN_STORE_PATH = Path(__file__).parent / "data" / "token_store.enc"
_OLD_TOKEN_STORE_PATH = Path(__file__).parent / "data" / "token_store.json"

def _migrate_old_token_store():
    if _OLD_TOKEN_STORE_PATH.exists() and not TOKEN_STORE_PATH.exists():
        try:
            data = json.loads(_OLD_TOKEN_STORE_PATH.read_text())
            _user_auth["access_token"] = data.get("access_token")
            _user_auth["refresh_token"] = data.get("refresh_token")
            _user_auth["expires_at"] = data.get("expires_at", 0)
            _save_token_store()
            _OLD_TOKEN_STORE_PATH.unlink(missing_ok=True)
            logger.info("Migrated token_store.json to encrypted format")
        except Exception:
            logger.warning("Failed to migrate old token store")

def _get_fernet() -> Fernet | None:
    key = os.environ.get("SPOTDL_TOKEN_ENCRYPTION_KEY")
    if key:
        try:
            return Fernet(key.encode())
        except Exception:
            logger.warning("Invalid SPOTDL_TOKEN_ENCRYPTION_KEY, storing tokens in plaintext")
    else:
        logger.warning("SPOTDL_TOKEN_ENCRYPTION_KEY not set, storing Spotify tokens in plaintext")
    return None


def _save_token_store() -> None:
    with _token_lock:
        TOKEN_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        data = json.dumps(_user_auth)
    fernet = _get_fernet()
    if fernet:
        data = fernet.encrypt(data.encode()).decode()
    TOKEN_STORE_PATH.write_text(data)


def _load_token_store() -> None:
    if TOKEN_STORE_PATH.exists():
        try:
            raw = TOKEN_STORE_PATH.read_text()
            fernet = _get_fernet()
            if fernet:
                try:
                    raw = fernet.decrypt(raw.encode()).decode()
                except Exception:
                    logger.warning("token_store decryption failed, ignoring")
                    return
            d = json.loads(raw)
            with _token_lock:
                _user_auth["access_token"] = d.get("access_token")
                _user_auth["refresh_token"] = d.get("refresh_token")
                _user_auth["expires_at"] = d.get("expires_at", 0)
        except Exception:
            logger.warning("token_store.json corrupted, ignoring")
            TOKEN_STORE_PATH.unlink(missing_ok=True)


_migrate_old_token_store()
_load_token_store()


def get_spotify_auth_url(redirect_uri: str | None = None) -> str:
    client_id = os.environ.get("SPOTIFY_CLIENT_ID")
    redirect_uri = redirect_uri or os.environ.get(
        "SPOTIFY_REDIRECT_URI",
        "http://localhost:8000/api/auth/spotify/callback",
    )
    scopes = "playlist-read-private playlist-read-collaborative offline_access"
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": scopes,
    }
    return f"https://accounts.spotify.com/authorize?{urllib.parse.urlencode(params)}"


def handle_spotify_callback(code: str, redirect_uri: str | None = None) -> dict:
    client_id = os.environ.get("SPOTIFY_CLIENT_ID")
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET")
    redirect_uri = redirect_uri or os.environ.get(
        "SPOTIFY_REDIRECT_URI",
        "http://localhost:8000/api/auth/spotify/callback",
    )

    resp = _session.post(
        "https://accounts.spotify.com/api/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
            "client_secret": client_secret,
        },
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()

    with _token_lock:
        _user_auth["access_token"] = data["access_token"]
        _user_auth["refresh_token"] = data.get("refresh_token", "")
        _user_auth["expires_at"] = time.time() + data["expires_in"]
    _save_token_store()

    return data


def get_user_token() -> str | None:
    with _token_lock:
        if not _user_auth["access_token"]:
            return None
        if time.time() < _user_auth["expires_at"]:
            return _user_auth["access_token"]

        if not _user_auth.get("refresh_token"):
            _user_auth["access_token"] = None
            _user_auth["expires_at"] = 0
            _save_token_store()
            return None
        try:
            _refresh_user_token()
        except Exception:
            logger.warning("token refresh failed, clearing auth")
            _user_auth["access_token"] = None
            _user_auth["refresh_token"] = None
            _user_auth["expires_at"] = 0
            _save_token_store()
            return None
        return _user_auth["access_token"]


def _refresh_user_token() -> None:
    client_id = os.environ.get("SPOTIFY_CLIENT_ID")
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET")

    resp = _session.post(
        "https://accounts.spotify.com/api/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": _user_auth["refresh_token"],
            "client_id": client_id,
            "client_secret": client_secret,
        },
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()

    _user_auth["access_token"] = data["access_token"]
    _user_auth["expires_at"] = time.time() + data.get("expires_in", 3600)
    if "refresh_token" in data:
        _user_auth["refresh_token"] = data["refresh_token"]
    _save_token_store()


def is_user_authenticated() -> bool:
    with _token_lock:
        return bool(_user_auth["access_token"])


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

    resp = _session.post("https://accounts.spotify.com/api/token", headers=headers, data=data, timeout=10)
    if resp.status_code == 200:
        return resp.json().get("access_token")
    else:
        try:
            detail = resp.json().get("error_description", resp.json().get("error", "unknown"))
        except Exception:
            detail = resp.text[:200]
        logger.error("Spotify client credentials failed: %s", detail)
        return None


def _fetch_official_track(track_id: str, token: str) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    resp = _session.get(f"https://api.spotify.com/v1/tracks/{track_id}", headers=headers, timeout=10)
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


def _extract_track_artwork(track: dict) -> str | None:
    for key in ("album", "album_of_track"):
        album = track.get(key)
        if isinstance(album, dict) and album.get("images"):
            images = album["images"]
            images.sort(key=lambda i: i.get("width") or 0, reverse=True)
            return images[0]["url"]
    return None


def _fetch_official_collection(kind: str, collection_id: str, token: str) -> dict:
    headers = {"Authorization": f"Bearer {token}"}

    coll_resp = _session.get(f"https://api.spotify.com/v1/{kind}s/{collection_id}", headers=headers, timeout=10)
    coll_resp.raise_for_status()
    coll_data = coll_resp.json()

    collection_name = coll_data.get("name", "Unknown Album/Playlist")
    collection_artwork = None
    if coll_data.get("images"):
        collection_artwork = coll_data["images"][0]["url"]

    tracks = []

    max_limit = 50 if kind == "album" else 100
    url = f"https://api.spotify.com/v1/{kind}s/{collection_id}/tracks?limit={max_limit}"
    while url:
        resp = _session.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        for item in data.get("items", []):
            track = item.get("track") if kind == "playlist" else item
            if not track or not track.get("id"):
                continue

            track_artwork = (
                _extract_track_artwork(track)
                or collection_artwork
            )

            track_album = track.get("album", {}).get("name")
            if not track_album:
                track_album = collection_name if kind == "album" else "Unknown Album"

            tracks.append({
                "title": track.get("name", "Unknown Track"),
                "artist": ", ".join(a["name"] for a in track.get("artists", [])),
                "album": track_album,
                "artwork_url": track_artwork,
                "url": track.get("external_urls", {}).get("spotify", f"https://open.spotify.com/track/{track['id']}"),
                "type": "track",
            })

        url = data.get("next")

    return {
        "collection_name": collection_name,
        "collection_artwork": collection_artwork,
        "collection_type": kind,
        "truncated": False,
        "total_count": len(tracks),
        "tracks": tracks,
    }


def _validate_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Only http/https URLs are supported")
    host = parsed.hostname.lower() if parsed.hostname else ""
    if host in ("localhost", "127.0.0.1", "0.0.0.0", "[::1]"):
        raise ValueError("Local URLs are not allowed")
    import ipaddress
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            raise ValueError("Private IP ranges are not allowed")
    except ValueError:
        pass  # not an IP address, proceed
    return url


def _fetch_generic_metadata(url: str) -> dict:
    url = _validate_url(url)
    import yt_dlp
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
                "truncated": False,
                "total_count": len(tracks),
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


def _try_official(kind: str, id_: str, token: str) -> dict | None:
    cb_name = f"spotify_official_{kind}"
    if source_is_open(cb_name):
        logger.warning("Spotify official %s circuit is open — skipping", kind)
        return None
    try:
        if kind == "track":
            result = _fetch_official_track(id_, token)
        else:
            result = _fetch_official_collection(kind, id_, token)
        get_circuit_breaker(cb_name).record_success()
        return result
    except requests.exceptions.HTTPError as e:
        get_circuit_breaker(cb_name).record_failure()
        if e.response.status_code in (403, 404):
            return None
        raise

def fetch_metadata(url: str) -> dict | list[dict]:
    from cache import get_cache, set_cache

    cached = get_cache(url)
    if cached:
        logger.info(f"fetch_metadata: cache HIT for {url}")
        return cached

    parsed = parse_url(url)
    if not parsed:
        try:
            result = _fetch_generic_metadata(url)
            set_cache(url, result)
            return result
        except Exception as e:
            raise ValueError(f"Could not parse URL. Ensure it is a valid Spotify, YouTube, or SoundCloud link. ({e})")

    kind, id_ = parsed

    user_token = get_user_token()
    logger.info(f"fetch_metadata: kind={kind}, id={id_}")
    if user_token:
        logger.info("fetch_metadata: trying user OAuth token")
        result = _try_official(kind, id_, user_token)
        if result:
            logger.info(f"fetch_metadata: user OAuth token SUCCESS, got {len(result.get('tracks', [])) if 'tracks' in result else 'track'} results")
            set_cache(url, result)
            return result
        logger.warning("fetch_metadata: user OAuth token FAILED (403/404), trying client credentials")

    cc_token = _get_spotify_token()
    if cc_token:
        logger.info("fetch_metadata: trying client credentials token")
        result = _try_official(kind, id_, cc_token)
        if result:
            logger.info(f"fetch_metadata: client credentials SUCCESS, got {len(result.get('tracks', [])) if 'tracks' in result else 'track'} results")
            set_cache(url, result)
            return result
        logger.warning("fetch_metadata: client credentials FAILED (403/404), falling back to scraper")
    else:
        logger.warning("fetch_metadata: no client credentials token available")

    logger.info(f"fetch_metadata: using embed scraper for {kind}")
    if kind == "track":
        result = _scrape_track(id_)
        set_cache(url, result)
        return result
    elif kind in ("album", "playlist"):
        result = _scrape_collection(kind, id_)
        set_cache(url, result)
        return result

    raise ValueError(f"Unsupported type: {kind}")
