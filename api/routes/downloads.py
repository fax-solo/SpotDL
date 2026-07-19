import os
import shutil
import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request, Depends, Query
from fastapi.responses import FileResponse, StreamingResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import DownloadLog, User
from auth import get_optional_user
from shared import _download_semaphore, verify_api_key, limiter

router = APIRouter(tags=["downloads"])
logger = logging.getLogger(__name__)


class DownloadRequest(BaseModel):
    title: str = Field(max_length=500)
    artist: str = Field(max_length=500)
    album: str = Field(default="Unknown Album", max_length=500)
    artwork_url: str | None = Field(default=None, max_length=2000)
    url: str | None = Field(default=None, max_length=2000)
    quality: str | None = Field(default=None, pattern="^(128|192|256|320)$", max_length=3)
    format: str | None = Field(default=None, pattern="^(mp3|m4a)$", max_length=3)


class DeezerDownloadRequest(BaseModel):
    arl: str = Field(min_length=1, max_length=200)
    title: str = Field(max_length=500)
    artist: str = Field(max_length=500)
    album: str = Field(default="Unknown Album", max_length=500)
    artwork_url: str | None = Field(default=None, max_length=2000)
    quality: str = Field(default="FLAC", pattern="^(FLAC|MP3)$", max_length=4)
    isrc: str | None = Field(default=None, max_length=50)
    duration_ms: int | None = Field(default=None, ge=0)


class LogDownloadRequest(BaseModel):
    track_title: str = Field(max_length=500)
    track_artist: str = Field(max_length=500)
    quality: str | None = Field(default=None, max_length=10)
    source: str | None = Field(default=None, max_length=50)


@router.get("/api/download")
@limiter.limit("10/minute")
async def download_combined(
    request: Request,
    query: str = Query(..., description="Spotify URL or search string"),
    quality: str = Query("320", pattern="^(128|192|256|320)$"),
    format: str = Query("mp3", pattern="^(mp3|m4a)$"),
    _auth=Depends(verify_api_key),
):
    from downloader import download_track_combined

    async with _download_semaphore:
        try:
            filepath, ext = await asyncio.to_thread(
                download_track_combined, query, quality, format,
            )
        except Exception:
            logger.exception("Combined download failed")
            raise HTTPException(status_code=502, detail="Download failed")

    def cleanup():
        parent = os.path.dirname(filepath)
        if os.path.isdir(parent):
            shutil.rmtree(parent, ignore_errors=True)

    safe_title = os.path.splitext(os.path.basename(filepath))[0]
    filename = f"{safe_title}{ext}"
    media_type = "audio/mpeg" if ext == ".mp3" else "audio/mp4"

    return FileResponse(
        path=filepath,
        media_type=media_type,
        filename=filename,
        background=BackgroundTask(cleanup),
    )


@router.post("/api/download/log")
@limiter.limit("60/minute")
async def log_download(
    request: Request,
    body: LogDownloadRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    log = DownloadLog(
        user_id=user.id if user else None,
        track_title=body.track_title,
        track_artist=body.track_artist,
        quality=body.quality,
        source=body.source,
        is_guest=user.is_guest if user else True,
    )
    db.add(log)
    await db.commit()
    return {"ok": True}


@router.post("/api/download")
@limiter.limit("10/minute")
async def download(request: Request, body: DownloadRequest, _auth=Depends(verify_api_key)):
    from downloader import download_track

    async with _download_semaphore:
        try:
            filepath, ext = await asyncio.to_thread(
                download_track, body.title, body.artist, body.album, body.artwork_url, body.url,
                body.quality or "320", body.format or "mp3",
            )
        except Exception:
            logger.exception("Download failed")
            raise HTTPException(status_code=502, detail="Download failed")

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


@router.post("/api/download/stream")
@limiter.limit("10/minute")
async def download_stream(request: Request, body: DownloadRequest, _auth=Depends(verify_api_key)):
    from downloader import stream_download
    import asyncio

    async def generate():
        async with _download_semaphore:
            try:
                async for chunk in stream_download(body.title, body.artist, body.album, body.artwork_url, body.url, body.quality or "320", body.format or "mp3"):
                    if await request.is_disconnected():
                        raise asyncio.CancelledError()
                    if isinstance(chunk, str):
                        yield chunk.encode()
                    else:
                        yield chunk
            except asyncio.CancelledError:
                pass

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-cache",
        },
    )


@router.post("/api/download/deezer")
@limiter.limit("10/minute")
async def deezer_download(request: Request, body: DeezerDownloadRequest, _auth=Depends(verify_api_key)):
    from deezer import DeezerClient, DeezerError

    client: DeezerClient | None = None
    try:
        client = DeezerClient(body.arl)
    except DeezerError:
        raise HTTPException(status_code=401, detail="Deezer authentication failed")

    try:
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
                    duration_ms=body.duration_ms,
                )

                def cleanup():
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
            except Exception:
                logger.exception("Deezer download failed")
                raise HTTPException(status_code=502, detail="Deezer download failed")
    finally:
        if client:
            client.close()
