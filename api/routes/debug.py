import os
import logging

from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from spotify import get_user_token, is_user_authenticated
from shared import DEBUG_MODE

router = APIRouter(tags=["debug"])
logger = logging.getLogger(__name__)
_limiter = Limiter(key_func=get_remote_address)


@router.get("/api/debug/auth")
@_limiter.limit("5/minute")
async def debug_auth(request: Request):
    if not DEBUG_MODE:
        raise HTTPException(status_code=404, detail="Not found")
    import requests as req
    token = get_user_token()
    info = {
        "authenticated": is_user_authenticated(),
        "has_token": token is not None,
        "token_prefix": (token[:10] + "...") if token else None,
    }
    if token:
        try:
            r = req.get("https://api.spotify.com/v1/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
            info["me_status"] = r.status_code
            if r.ok:
                info["me"] = r.json().get("id")
        except Exception:
            info["me_error"] = "request failed"
    return info
