import os
import shutil
import sqlite3
import logging

from fastapi import APIRouter, Request

from shared import DOWNLOAD_SEMAPHORE_LIMIT, active_downloads, limiter
from spotify import is_user_authenticated

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


def _db_healthy() -> bool:
    db_path = os.environ.get("SPOTDL_DB_PATH", os.path.join(os.path.dirname(__file__), "..", "data", "app.db"))
    try:
        conn = sqlite3.connect(db_path, timeout=2)
        conn.execute("SELECT 1")
        conn.close()
        return True
    except Exception:
        return False


def _disk_usage() -> dict:
    path = os.environ.get("SPOTDL_DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
    os.makedirs(path, exist_ok=True)
    try:
        usage = shutil.disk_usage(path)
        return {
            "total_gb": round(usage.total / (1024**3), 1),
            "free_gb": round(usage.free / (1024**3), 1),
            "free_pct": round(usage.free / usage.total * 100, 1),
        }
    except Exception:
        return {"total_gb": 0, "free_gb": 0, "free_pct": 0}


@router.get("/api/ping")
@limiter.limit("30/minute")
async def ping(request: Request):
    return {"ok": True, "version": "2.0.0"}


@router.get("/api/status")
@limiter.limit("30/minute")
async def status(request: Request):
    has_ffmpeg = shutil.which("ffmpeg") is not None
    return {
        "ok": True,
        "ffmpeg": has_ffmpeg,
        "authenticated": is_user_authenticated(),
        "has_spotify_creds": bool(os.environ.get("SPOTIFY_CLIENT_ID")),
        "concurrent_downloads": DOWNLOAD_SEMAPHORE_LIMIT,
        "active_downloads": active_downloads(),
        "db_healthy": _db_healthy(),
        "disk": _disk_usage(),
    }


@router.get("/api/config")
@limiter.limit("30/minute")
async def config(request: Request):
    return {
        "concurrent_downloads": DOWNLOAD_SEMAPHORE_LIMIT,
        "ffmpeg_available": shutil.which("ffmpeg") is not None,
    }
