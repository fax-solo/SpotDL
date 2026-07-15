import os
import shutil
import logging

from fastapi import APIRouter, Request

from shared import DOWNLOAD_SEMAPHORE_LIMIT, limiter
from spotify import is_user_authenticated

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


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
    }


@router.get("/api/config")
@limiter.limit("30/minute")
async def config(request: Request):
    return {
        "concurrent_downloads": DOWNLOAD_SEMAPHORE_LIMIT,
        "ffmpeg_available": shutil.which("ffmpeg") is not None,
    }
