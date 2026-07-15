import os
import asyncio
import secrets
import logging

from fastapi import HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)

DOWNLOAD_SEMAPHORE_LIMIT = int(os.environ.get("SPOTDL_CONCURRENT_DOWNLOADS", "4"))
_download_semaphore = asyncio.Semaphore(DOWNLOAD_SEMAPHORE_LIMIT)

API_KEY = os.environ.get("SPOTDL_API_KEY", "")
DEBUG_MODE = os.environ.get("SPOTDL_DEBUG", "").lower() in ("1", "true", "yes")

limiter = Limiter(key_func=get_remote_address)


def verify_api_key(request: Request):
    if not API_KEY:
        return True
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer ") and secrets.compare_digest(auth[7:], API_KEY):
        return True
    raise HTTPException(status_code=401, detail="Invalid or missing API key")
