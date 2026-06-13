import os
import sys
import shutil
import logging
import urllib.parse
import traceback

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel

from spotify import (
    fetch_metadata,
    get_spotify_auth_url,
    get_user_token,
    handle_spotify_callback,
    is_user_authenticated,
)

app = FastAPI(title="SpotDL API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("CLIENT_URL", "*")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DownloadRequest(BaseModel):
    title: str
    artist: str
    album: str = "Unknown Album"
    artwork_url: str | None = None
    url: str | None = None


@app.get("/api/ping")
def ping():
    return {"ok": True}


@app.get("/api/debug/auth")
def debug_auth():
    import requests as req
    token = get_user_token()
    info = {
        "authenticated": is_user_authenticated(),
        "has_token": token is not None,
        "token_prefix": token[:10] + "..." if token else None,
    }
    if token:
        try:
            r = req.get("https://api.spotify.com/v1/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
            info["me_status"] = r.status_code
            if r.ok:
                info["me"] = r.json().get("id")
            else:
                info["me_error"] = r.text[:200]
        except Exception as e:
            info["me_error"] = str(e)
    try:
        r = req.get("https://api.spotify.com/v1/playlists/37i9dQZF1DWXRqgorJj26U", headers={"Authorization": f"Bearer {token or ''}"}, timeout=10)
        info["playlist_status"] = r.status_code
        info["playlist_tracks_url"] = r.json().get("tracks", {}).get("href") if r.ok else None
    except Exception as e:
        info["playlist_error"] = str(e)
    return info


CLIENT_URL = os.environ.get("CLIENT_URL", "http://localhost:5173")


@app.get("/api/auth/spotify/login")
def spotify_login(redirect_uri: str = Query(None, description="Override redirect URI (used by mobile app)")):
    if redirect_uri:
        return RedirectResponse(url=get_spotify_auth_url(redirect_uri))
    return RedirectResponse(url=get_spotify_auth_url())


@app.get("/api/auth/spotify/callback")
def spotify_callback(code: str = Query(...)):
    try:
        handle_spotify_callback(code)
        return RedirectResponse(url=f"{CLIENT_URL}/")
    except Exception as e:
        traceback.print_exc()
        return RedirectResponse(url=f"{CLIENT_URL}/?auth_error={urllib.parse.quote(str(e))}")


@app.get("/api/auth/spotify/exchange")
def spotify_exchange(code: str = Query(...), redirect_uri: str = Query(None)):
    try:
        data = handle_spotify_callback(code, redirect_uri)
        return {"ok": True, "authenticated": True, "expires_in": data.get("expires_in", 3600)}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=str(e))

@app.get("/api/auth/status")
def auth_status():
    return {"authenticated": is_user_authenticated()}


@app.get("/api/metadata")
def get_metadata(url: str = Query(..., description="Spotify track/album/playlist URL")):
    try:
        data = fetch_metadata(url)
        return {"ok": True, "data": data}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/download")
def download(body: DownloadRequest):
    from downloader import download_track

    try:
        filepath, ext = download_track(body.title, body.artist, body.album, body.artwork_url, body.url)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=str(e))

    def cleanup():
        parent = os.path.dirname(filepath)
        if os.path.isdir(parent):
            shutil.rmtree(parent, ignore_errors=True)

    safe_artist = body.artist.replace("/", "_").replace("\\", "_")
    safe_title = body.title.replace("/", "_").replace("\\", "_")
    filename = f"{safe_artist} - {safe_title}{ext}"
    media_type = "audio/mpeg" if ext == ".mp3" else "audio/mp4"

    return FileResponse(
        path=filepath,
        media_type=media_type,
        filename=filename,
        background=BackgroundTask(cleanup),
    )
