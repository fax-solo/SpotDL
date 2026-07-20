import os
import re
import shutil
import asyncio
import logging
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from smartdl.metadata import resolve_metadata, TrackMetadata, configure as configure_spotify
from smartdl.audio import download_audio
from smartdl.tagging import tag_mp3, _download_cover
from smartdl.lyrics import fetch_lrclib, inject_lyrics
from artwork_fallback import find_artwork

logger = logging.getLogger("smartdl")

app = FastAPI(title="SmartDL API", version="1.0.0")

SPOTIFY_CLIENT_ID = os.environ.get("SPOTIFY_CLIENT_ID", "")
SPOTIFY_CLIENT_SECRET = os.environ.get("SPOTIFY_CLIENT_SECRET", "")

if SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET:
    configure_spotify(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET)


class DownloadRequest(BaseModel):
    query: Optional[str] = None
    spotify_url: Optional[str] = None
    track_name: Optional[str] = None
    artist_name: Optional[str] = None
    album_name: Optional[str] = None
    cover_art_url: Optional[str] = None
    duration: Optional[float] = None
    quality: str = Field("256", pattern=r"^(128|192|256|320)$")


def _safe_filename(s: str) -> str:
    return re.sub(r'[^\w\-_., ]', "_", s)


@app.get("/search/music")
async def search_music(query: str = Query(..., min_length=1)):
    results = await asyncio.to_thread(resolve_metadata, query)
    return {"ok": True, "results": [r.to_dict() for r in results]}


@app.get("/lyrics")
async def lyrics(
    track_name: str = Query(...),
    artist_name: str = Query(...),
    album_name: str = Query(""),
    duration: float = Query(0.0, ge=0),
):
    data = await asyncio.to_thread(
        fetch_lrclib, artist_name, track_name, album_name, duration,
    )
    if not data:
        return {"ok": False, "plainLyrics": None, "syncedLyrics": None}
    return {
        "ok": True,
        "plainLyrics": data.get("plainLyrics"),
        "syncedLyrics": data.get("syncedLyrics"),
    }


@app.post("/download/process")
async def download_process(
    req: DownloadRequest,
    background_tasks: BackgroundTasks,
):
    quality = req.quality

    meta: TrackMetadata | None = None

    if req.track_name and req.artist_name:
        meta = TrackMetadata(
            title=req.track_name,
            artist=req.artist_name,
            album=req.album_name or "Unknown",
            cover_art_url=req.cover_art_url,
            duration_seconds=req.duration or 0,
            source="client",
        )
    elif req.spotify_url or req.query:
        search_query = req.spotify_url or req.query or ""
        meta_list = await asyncio.to_thread(resolve_metadata, search_query)
        if not meta_list:
            raise HTTPException(status_code=404, detail="No metadata found for query")
        meta = meta_list[0]
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide either spotify_url/query or track_name+artist_name",
        )

    logger.info(
        "download: resolved metadata — title='%s' artist='%s' source='%s'",
        meta.title, meta.artist, meta.source,
    )

    cover_data = None
    if not meta.cover_art_url and meta.title and meta.artist:
        meta.cover_art_url = await asyncio.to_thread(
            find_artwork, meta.title, meta.artist,
        )
    if meta.cover_art_url:
        cover_data = await asyncio.to_thread(_download_cover, meta.cover_art_url)

    filepath, ext, tmpdir = await download_audio(meta.artist, meta.title, quality)

    await asyncio.to_thread(
        tag_mp3, filepath, meta.title, meta.artist, meta.album, cover_data,
    )
    await asyncio.to_thread(
        inject_lyrics, filepath, meta.artist, meta.title, meta.album, meta.duration_seconds,
    )

    background_tasks.add_task(shutil.rmtree, tmpdir, ignore_errors=True)

    safe_artist = _safe_filename(meta.artist)
    safe_title = _safe_filename(meta.title)
    filename = f"{safe_artist} - {safe_title}{ext}"
    media_type = "audio/mpeg" if ext == ".mp3" else "audio/mp4"

    return FileResponse(
        path=filepath,
        media_type=media_type,
        filename=filename,
    )


@app.get("/health")
async def health():
    return {"ok": True, "app": "SmartDL API", "version": "1.0.0"}
