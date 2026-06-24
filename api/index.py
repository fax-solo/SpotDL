import os
import sys
import json
import shutil
import logging
import urllib.parse
import traceback
import asyncio
from contextlib import asynccontextmanager

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel, Field

from spotify import (
    fetch_metadata,
    get_spotify_auth_url,
    get_user_token,
    handle_spotify_callback,
    is_user_authenticated,
)

# Global semaphore to limit concurrent downloads
# yt-dlp is I/O-bound, so 4 concurrent downloads is reasonable
DOWNLOAD_SEMAPHORE_LIMIT = int(os.environ.get("SPOTDL_CONCURRENT_DOWNLOADS", "4"))
_download_semaphore = asyncio.Semaphore(DOWNLOAD_SEMAPHORE_LIMIT)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.info(f"Starting Sinc API v2.0.0 — concurrent downloads: {DOWNLOAD_SEMAPHORE_LIMIT}")
    yield
    logging.info("Shutting down Sinc API")


app = FastAPI(title="Sinc API", version="2.0.0", lifespan=lifespan)

CLIENT_URL = os.environ.get("CLIENT_URL", "")
_cors_origins = [CLIENT_URL] if CLIENT_URL else ["http://localhost:5173", "http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DownloadRequest(BaseModel):
    title: str = Field(max_length=500)
    artist: str = Field(max_length=500)
    album: str = Field(default="Unknown Album", max_length=500)
    artwork_url: str | None = Field(default=None, max_length=2000)
    url: str | None = Field(default=None, max_length=2000)


class DeezerDownloadRequest(BaseModel):
    arl: str = Field(min_length=1, max_length=200)
    title: str = Field(max_length=500)
    artist: str = Field(max_length=500)
    album: str = Field(default="Unknown Album", max_length=500)
    artwork_url: str | None = Field(default=None, max_length=2000)
    quality: str = Field(default="FLAC", pattern="^(FLAC|MP3)$", max_length=4)
    isrc: str | None = Field(default=None, max_length=50)


# ─── Health ───

@app.get("/api/ping")
async def ping():
    return {"ok": True, "version": "2.0.0"}


@app.get("/api/status")
async def status():
    has_ffmpeg = shutil.which("ffmpeg") is not None
    return {
        "ok": True,
        "ffmpeg": has_ffmpeg,
        "authenticated": is_user_authenticated(),
        "has_spotify_creds": bool(os.environ.get("SPOTIFY_CLIENT_ID")),
        "concurrent_downloads": DOWNLOAD_SEMAPHORE_LIMIT,
    }


@app.get("/api/config")
async def config():
    return {
        "concurrent_downloads": DOWNLOAD_SEMAPHORE_LIMIT,
        "ffmpeg_available": shutil.which("ffmpeg") is not None,
    }


ALLOWED_REDIRECT_URIS = os.environ.get("SPOTIFY_REDIRECT_URI", "http://localhost:8000/api/auth/spotify/callback").split(",")


@app.get("/api/auth/spotify/login")
async def spotify_login(redirect_uri: str = Query(None, description="Override redirect URI (used by mobile app)")):
    if redirect_uri:
        if redirect_uri not in ALLOWED_REDIRECT_URIS and not redirect_uri.startswith("http://127.0.0.1") and not redirect_uri.startswith("capacitor://"):
            raise HTTPException(status_code=400, detail="Invalid redirect_uri")
        return RedirectResponse(url=get_spotify_auth_url(redirect_uri))
    return RedirectResponse(url=get_spotify_auth_url())


@app.get("/api/auth/spotify/callback")
async def spotify_callback(code: str = Query(...)):
    try:
        handle_spotify_callback(code)
        return RedirectResponse(url=f"{CLIENT_URL}/")
    except Exception as e:
        traceback.print_exc()
        return RedirectResponse(url=f"{CLIENT_URL}/?auth_error={urllib.parse.quote(str(e))}")


@app.get("/api/auth/spotify/exchange")
async def spotify_exchange(code: str = Query(...), redirect_uri: str = Query(None)):
    try:
        data = handle_spotify_callback(code, redirect_uri)
        return {"ok": True, "authenticated": True, "expires_in": data.get("expires_in", 3600)}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/auth/status")
async def auth_status():
    return {"authenticated": is_user_authenticated()}


# ─── Metadata ───

@app.get("/api/metadata")
async def get_metadata(url: str = Query(..., description="Spotify track/album/playlist URL")):
    try:
        data = fetch_metadata(url)
        return {"ok": True, "data": data}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=str(e))


# ─── Download (async, runs yt-dlp in thread pool) ───

@app.post("/api/download")
async def download(body: DownloadRequest):
    from downloader import download_track

    async with _download_semaphore:
        try:
            filepath, ext = await asyncio.to_thread(
                download_track, body.title, body.artist, body.album, body.artwork_url, body.url
            )
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


# ─── Download (streaming, with progress) ───

@app.post("/api/download/stream")
async def download_stream(body: DownloadRequest):
    from downloader import stream_download

    async def generate():
        async with _download_semaphore:
            buffer = b""
            async for chunk in stream_download(body.title, body.artist, body.album, body.artwork_url, body.url):
                if isinstance(chunk, str):
                    yield chunk.encode()
                else:
                    buffer += chunk

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-cache",
        },
    )


# ─── Playlist Sync (subscriptions + auto-download) ───

class SubscribeRequest(BaseModel):
    url: str = Field(max_length=2000)
    interval: str = Field(default="daily", pattern="^(manual|hourly|daily|weekly)$")


@app.post("/api/sync/subscribe")
async def sync_subscribe(body: SubscribeRequest):
    from sync import add_subscription
    try:
        sub = add_subscription(body.url, body.interval)
        return {"ok": True, "subscription": sub}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/sync/subscriptions")
async def sync_list():
    from sync import list_subscriptions
    return {"ok": True, "subscriptions": list_subscriptions()}


@app.delete("/api/sync/subscribe/{sub_id}")
async def sync_unsubscribe(sub_id: str):
    from sync import remove_subscription
    try:
        remove_subscription(sub_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/sync/run/{sub_id}")
async def sync_run(sub_id: str):
    from sync import run_sync
    try:
        result = await asyncio.to_thread(run_sync, sub_id)
        return {"ok": True, "result": result}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/sync/run-all")
async def sync_run_all():
    from sync import run_all_syncs
    try:
        results = await asyncio.to_thread(run_all_syncs)
        return {"ok": True, "results": results}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=str(e))


# ─── Deezer Download (ARL-based, Blowfish decryption) ───

@app.post("/api/download/deezer")
async def deezer_download(body: DeezerDownloadRequest):
    from deezer import DeezerClient, DeezerError

    try:
        client = DeezerClient(body.arl)
    except DeezerError as e:
        raise HTTPException(status_code=401, detail=f"Deezer auth failed: {e}")

    async with _download_semaphore:
        try:
            filepath, ext = await asyncio.to_thread(
                client.search_and_download,
                title=body.title,
                artist=body.artist,
                album=body.album,
                artwork_url=body.artwork_url,
                quality=body.quality,
                isrc=body.isrc,
            )

            def cleanup():
                import shutil
                parent = os.path.dirname(filepath)
                if os.path.isdir(parent):
                    shutil.rmtree(parent, ignore_errors=True)

            safe_artist = body.artist.replace("/", "_").replace("\\", "_")
            safe_title = body.title.replace("/", "_").replace("\\", "_")
            filename = f"{safe_artist} - {safe_title}{ext}"
            media_type = "audio/flac" if ext == ".flac" else "audio/mpeg"

            return FileResponse(
                path=filepath,
                media_type=media_type,
                filename=filename,
                background=BackgroundTask(cleanup),
            )

        except DeezerError as e:
            raise HTTPException(status_code=502, detail=str(e))
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=502, detail=f"Deezer download failed: {e}")
        finally:
            client.close()


# ─── Scrapling-powered endpoints (server-side anti-bot scraping) ───

class ScraplingLyricsRequest(BaseModel):
    trackName: str = Field(max_length=500)
    artistName: str = Field(max_length=500)
    albumName: str | None = Field(default=None, max_length=500)
    duration: float | None = Field(default=None)


@app.post("/api/lyrics")
async def scrapling_lyrics(body: ScraplingLyricsRequest):
    from scrapling_scraper import fetch_lyrics, is_available

    if not is_available():
        raise HTTPException(status_code=501, detail="Scrapling not installed on server")

    result = await asyncio.to_thread(fetch_lyrics, body.artistName, body.trackName)
    if result:
        return {"plainLyrics": result["plainLyrics"], "syncedLyrics": result["syncedLyrics"]}
    return {"plainLyrics": None, "syncedLyrics": None}


class ScraplingBandcampRequest(BaseModel):
    action: str = Field(pattern="^(search|info)$")
    query: str | None = Field(default=None, max_length=500)
    url: str | None = Field(default=None, max_length=2000)


@app.post("/api/bandcamp")
async def scrapling_bandcamp(body: ScraplingBandcampRequest):
    from scrapling_scraper import search_bandcamp, bandcamp_info, is_available

    if not is_available():
        raise HTTPException(status_code=501, detail="Scrapling not installed on server")

    try:
        if body.action == "search" and body.query:
            results = await asyncio.to_thread(search_bandcamp, body.query)
            return {"results": results}
        elif body.action == "info" and body.url:
            info = await asyncio.to_thread(bandcamp_info, body.url)
            if info:
                return info
            raise HTTPException(status_code=502, detail="No audio found on this page")
        else:
            raise HTTPException(status_code=400, detail="Invalid action or missing parameters")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


class ScraplingSoundcloudRequest(BaseModel):
    action: str = Field(pattern="^(search|info)$")
    query: str | None = Field(default=None, max_length=500)
    url: str | None = Field(default=None, max_length=2000)


@app.post("/api/soundcloud")
async def scrapling_soundcloud(body: ScraplingSoundcloudRequest):
    from scrapling_scraper import search_soundcloud, soundcloud_info, is_available

    if not is_available():
        raise HTTPException(status_code=501, detail="Scrapling not installed on server")

    try:
        if body.action == "search" and body.query:
            results = await asyncio.to_thread(search_soundcloud, body.query)
            return {"results": results}
        elif body.action == "info" and body.url:
            info = await asyncio.to_thread(soundcloud_info, body.url)
            if info:
                return info
            raise HTTPException(status_code=502, detail="Track not found")
        else:
            raise HTTPException(status_code=400, detail="Invalid action or missing parameters")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/debug/auth")
async def debug_auth():
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
