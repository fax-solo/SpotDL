import os
import re
import json
import time
import logging
import shutil
from datetime import datetime, timezone

from downloader import download_track
from spotify import fetch_metadata

logger = logging.getLogger(__name__)

SYNC_DB_PATH = os.environ.get("SYNC_DB_PATH", "data/sync.json")
SYNC_DOWNLOAD_DIR = os.environ.get("SYNC_DOWNLOAD_DIR", "sync_music")


def _load_db() -> dict:
    if not os.path.exists(SYNC_DB_PATH):
        return {"subscriptions": []}
    try:
        with open(SYNC_DB_PATH) as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return {"subscriptions": []}


def _save_db(db: dict):
    parent = os.path.dirname(SYNC_DB_PATH)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(SYNC_DB_PATH, "w") as f:
        json.dump(db, f, indent=2)


def list_subscriptions() -> list[dict]:
    return _load_db()["subscriptions"]


def add_subscription(playlist_url: str, interval: str = "daily") -> dict:
    parsed = _parse_playlist_url(playlist_url)
    if not parsed:
        raise ValueError("Invalid Spotify playlist URL")

    playlist_id = parsed

    db = _load_db()

    existing = next((s for s in db["subscriptions"] if s["playlist_id"] == playlist_id), None)
    if existing:
        existing["interval"] = interval
        _save_db(db)
        return existing

    sub = {
        "id": str(int(time.time() * 1000)),
        "playlist_id": playlist_id,
        "playlist_url": f"https://open.spotify.com/playlist/{playlist_id}",
        "playlist_name": "",
        "interval": interval,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_synced_at": None,
        "synced_tracks": [],
    }

    try:
        meta = fetch_metadata(sub["playlist_url"])
        sub["playlist_name"] = meta.get("collection_name", "") or ""
    except Exception as e:
        logger.warning(f"sync: failed to fetch playlist name for {playlist_id}: {e}")

    db["subscriptions"].append(sub)
    _save_db(db)
    return sub


def remove_subscription(sub_id: str):
    db = _load_db()
    db["subscriptions"] = [s for s in db["subscriptions"] if s["id"] != sub_id]
    _save_db(db)


def update_subscription_interval(sub_id: str, interval: str):
    db = _load_db()
    for s in db["subscriptions"]:
        if s["id"] == sub_id:
            s["interval"] = interval
            _save_db(db)
            return s
    raise ValueError(f"Subscription {sub_id} not found")


def run_sync(sub_id: str) -> dict:
    db = _load_db()
    sub = next((s for s in db["subscriptions"] if s["id"] == sub_id), None)
    if not sub:
        raise ValueError(f"Subscription {sub_id} not found")

    meta = fetch_metadata(sub["playlist_url"])
    tracks = meta.get("tracks", [])
    if not tracks:
        raise ValueError("No tracks found in playlist")

    playlist_name = meta.get("collection_name", "") or sub["playlist_name"]
    sub["playlist_name"] = playlist_name

    known = set(sub.get("synced_tracks", []))
    new_tracks = [t for t in tracks if t.get("url") not in known]

    if not new_tracks:
        sub["last_synced_at"] = datetime.now(timezone.utc).isoformat()
        _save_db(db)
        return {"total": len(tracks), "new": 0, "downloaded": 0, "failed": 0, "errors": []}

    playlist_dir = _safe_dir(playlist_name) if playlist_name else sub["playlist_id"]
    track_dir = os.path.join(SYNC_DOWNLOAD_DIR, playlist_dir)
    os.makedirs(track_dir, exist_ok=True)

    results = []

    for track in new_tracks:
        try:
            filepath, ext = download_track(
                track["title"],
                track["artist"],
                track.get("album", "Unknown Album"),
                track.get("artwork_url"),
                track.get("url"),
            )

            safe_artist = _safe(track["artist"])
            safe_title = _safe(track["title"])
            dest = os.path.join(track_dir, f"{safe_artist} - {safe_title}{ext}")

            shutil.move(filepath, dest)

            known.add(track["url"])
            results.append({"title": track["title"], "status": "ok"})
            logger.info(f"sync: downloaded '{track['title']}' to {dest}")

        except Exception as e:
            logger.error(f"sync: failed '{track.get('title')}': {e}")
            results.append({"title": track.get("title", "unknown"), "status": "failed", "error": str(e)})

    sub["synced_tracks"] = list(known)
    sub["last_synced_at"] = datetime.now(timezone.utc).isoformat()
    _save_db(db)

    ok_count = sum(1 for r in results if r["status"] == "ok")
    fail_count = sum(1 for r in results if r["status"] == "failed")
    errors = [r["error"] for r in results if r.get("error")]

    return {
        "total": len(tracks),
        "new": len(new_tracks),
        "downloaded": ok_count,
        "failed": fail_count,
        "errors": errors,
        "playlist_name": playlist_name,
    }


def run_all_syncs() -> list[dict]:
    subs = list_subscriptions()
    results = []
    for sub in subs:
        try:
            result = run_sync(sub["id"])
            result["playlist_id"] = sub["playlist_id"]
            result["playlist_name"] = sub.get("playlist_name", "")
            results.append(result)
        except Exception as e:
            results.append({
                "playlist_id": sub["playlist_id"],
                "playlist_name": sub.get("playlist_name", ""),
                "error": str(e),
            })
    return results


def _parse_playlist_url(url: str) -> str | None:
    m = re.search(r"spotify\.com/playlist/([a-zA-Z0-9]+)", url)
    return m.group(1) if m else None


def _safe(s: str) -> str:
    return re.sub(r'[/\\?%*:|"<>]', "_", s)


def _safe_dir(s: str) -> str:
    return re.sub(r'[/\\?%*:|"<>\s]', "_", s).strip("_") or "playlist"
