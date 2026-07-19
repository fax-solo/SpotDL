import os
import re
import json
import time
import threading
import logging
import shutil
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from downloader import download_track
from spotify import fetch_metadata

logger = logging.getLogger(__name__)

SYNC_DB_PATH = os.environ.get("SYNC_DB_PATH", "data/sync.json")
SYNC_DOWNLOAD_DIR = os.environ.get("SYNC_DOWNLOAD_DIR", "sync_music")

_sync_db_lock = threading.Lock()


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
    tmp = SYNC_DB_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(db, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, SYNC_DB_PATH)


def _with_write_lock(fn):
    with _sync_db_lock:
        db = _load_db()
        result = fn(db)
        _save_db(db)
    return result


def list_subscriptions() -> list[dict]:
    return _load_db()["subscriptions"]


def add_subscription(playlist_url: str, interval: str = "daily") -> dict:
    parsed = _parse_playlist_url(playlist_url)
    if not parsed:
        raise ValueError("Invalid Spotify playlist URL")

    playlist_id = parsed

    def _do_add(db: dict) -> dict:
        existing = next((s for s in db["subscriptions"] if s["playlist_id"] == playlist_id), None)
        if existing:
            existing["interval"] = interval
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
        return sub

    return _with_write_lock(_do_add)


def remove_subscription(sub_id: str):
    def _do_remove(db: dict):
        db["subscriptions"] = [s for s in db["subscriptions"] if s["id"] != sub_id]
    return _with_write_lock(_do_remove)


def update_subscription_interval(sub_id: str, interval: str):
    def _do_update(db: dict):
        for s in db["subscriptions"]:
            if s["id"] == sub_id:
                s["interval"] = interval
                return s
        raise ValueError(f"Subscription {sub_id} not found")
    return _with_write_lock(_do_update)


def run_sync(sub_id: str) -> dict:
    sub = _load_subscription(sub_id)
    if not sub:
        raise ValueError(f"Subscription {sub_id} not found")

    meta = fetch_metadata(sub["playlist_url"])
    tracks = meta.get("tracks", [])
    if not tracks:
        raise ValueError("No tracks found in playlist")

    playlist_name = meta.get("collection_name", "") or sub["playlist_name"]

    known = set(sub.get("synced_tracks", []))
    _known_lock = threading.Lock()
    new_tracks = [t for t in tracks if t.get("url") not in known]

    if not new_tracks:
        def _touch(db: dict):
            for s in db["subscriptions"]:
                if s["id"] == sub_id:
                    s["playlist_name"] = playlist_name
                    s["last_synced_at"] = datetime.now(timezone.utc).isoformat()
        _with_write_lock(_touch)
        return {"total": len(tracks), "new": 0, "downloaded": 0, "failed": 0, "errors": []}

    playlist_dir = _safe_dir(playlist_name) if playlist_name else sub["playlist_id"]
    track_dir = os.path.join(SYNC_DOWNLOAD_DIR, playlist_dir)
    os.makedirs(track_dir, exist_ok=True)

    results: list[dict] = []
    SYNC_CONCURRENCY = int(os.environ.get("SYNC_CONCURRENCY", "2"))

    def _download_one(track: dict) -> dict:
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

            with _known_lock:
                known.add(track["url"])
            logger.info(f"sync: downloaded '{track['title']}' to {dest}")
            return {"title": track["title"], "status": "ok"}

        except Exception as e:
            logger.error(f"sync: failed '{track.get('title')}': {e}")
            return {"title": track.get("title", "unknown"), "status": "failed", "error": str(e)}

    with ThreadPoolExecutor(max_workers=SYNC_CONCURRENCY) as executor:
        futures = {executor.submit(_download_one, t): t for t in new_tracks}
        for future in as_completed(futures):
            results.append(future.result())

    def _save_results(db: dict):
        for s in db["subscriptions"]:
            if s["id"] == sub_id:
                existing_known = set(s.get("synced_tracks", []))
                existing_known.update(known)
                s["synced_tracks"] = list(existing_known)
                s["last_synced_at"] = datetime.now(timezone.utc).isoformat()
                s["playlist_name"] = playlist_name
    _with_write_lock(_save_results)

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


def _load_subscription(sub_id: str) -> dict | None:
    db = _load_db()
    return next((s for s in db["subscriptions"] if s["id"] == sub_id), None)


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
