import os
import logging

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from spotify import get_spotify_auth_url, handle_spotify_callback, is_user_authenticated

router = APIRouter(tags=["spotify-auth"])
logger = logging.getLogger(__name__)
_limiter = Limiter(key_func=get_remote_address)

ALLOWED_REDIRECT_URIS = os.environ.get("SPOTIFY_REDIRECT_URI", "http://localhost:8000/api/auth/spotify/callback").split(",")
CLIENT_URL = os.environ.get("CLIENT_URL", "")


@router.get("/api/auth/spotify/login")
@_limiter.limit("20/minute")
async def spotify_login(request: Request, redirect_uri: str = Query(None)):
    if redirect_uri:
        if redirect_uri not in ALLOWED_REDIRECT_URIS and not redirect_uri.startswith("http://127.0.0.1") and not redirect_uri.startswith("capacitor://"):
            raise HTTPException(status_code=400, detail="Invalid redirect_uri")
        return RedirectResponse(url=get_spotify_auth_url(redirect_uri))
    return RedirectResponse(url=get_spotify_auth_url())


@router.get("/api/auth/spotify/callback")
@_limiter.limit("20/minute")
async def spotify_callback(request: Request, code: str = Query(...)):
    try:
        handle_spotify_callback(code)
        return RedirectResponse(url=f"{CLIENT_URL}/")
    except Exception:
        logger.exception("Spotify callback failed")
        return RedirectResponse(url=f"{CLIENT_URL}/?auth_error=authentication+failed")


@router.get("/api/auth/spotify/exchange")
@_limiter.limit("20/minute")
async def spotify_exchange(request: Request, code: str = Query(...), redirect_uri: str = Query(None)):
    try:
        data = handle_spotify_callback(code, redirect_uri)
        return {"ok": True, "authenticated": True, "expires_in": data.get("expires_in", 3600)}
    except Exception:
        logger.exception("Spotify token exchange failed")
        raise HTTPException(status_code=502, detail="Token exchange failed")


@router.get("/api/auth/status")
@_limiter.limit("30/minute")
async def auth_status(request: Request):
    return {"authenticated": is_user_authenticated()}
