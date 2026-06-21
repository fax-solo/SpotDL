import json
import os
import time
import hashlib
import threading
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).parent / "data" / "cache"
CACHE_TTL = int(os.environ.get("SPOTDL_CACHE_TTL", "300"))  # 5 minutes default
_cache_lock = threading.Lock()


def _ensure_cache_dir():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _cache_path(key: str) -> Path:
    digest = hashlib.sha256(key.encode()).hexdigest()
    return CACHE_DIR / f"{digest}.json"


def get_cache(key: str) -> dict | None:
    path = _cache_path(key)
    if not path.exists():
        return None
    with _cache_lock:
        try:
            data = json.loads(path.read_text())
            if time.time() - data.get("_cached_at", 0) < CACHE_TTL:
                return data.get("data")
            path.unlink(missing_ok=True)
        except (json.JSONDecodeError, OSError) as e:
            logger.debug(f"Cache read error for {key}: {e}")
    return None


def set_cache(key: str, data: dict):
    path = _cache_path(key)
    with _cache_lock:
        try:
            _ensure_cache_dir()
            path.write_text(json.dumps({"_cached_at": time.time(), "data": data}))
        except OSError as e:
            logger.debug(f"Cache write error for {key}: {e}")


def clear_cache(max_age: int | None = None):
    """Clear all cache entries, or only those older than max_age seconds."""
    if not CACHE_DIR.exists():
        return
    now = time.time()
    cleared = 0
    for path in CACHE_DIR.iterdir():
        if path.suffix == ".json":
            if max_age is not None:
                try:
                    data = json.loads(path.read_text())
                    if now - data.get("_cached_at", 0) < max_age:
                        continue
                except (json.JSONDecodeError, OSError):
                    pass
            path.unlink(missing_ok=True)
            cleared += 1
    if cleared:
        logger.info(f"Cleared {cleared} cache entries")
