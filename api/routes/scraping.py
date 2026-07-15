import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from shared import limiter

router = APIRouter(tags=["scraping"])
logger = logging.getLogger(__name__)


class ScraplingLyricsRequest(BaseModel):
    trackName: str = Field(max_length=500)
    artistName: str = Field(max_length=500)
    albumName: str | None = Field(default=None, max_length=500)
    duration: float | None = Field(default=None)


class ScraplingBandcampRequest(BaseModel):
    action: str = Field(pattern="^(search|info)$")
    query: str | None = Field(default=None, max_length=500)
    url: str | None = Field(default=None, max_length=2000)


class ScraplingSoundcloudRequest(BaseModel):
    action: str = Field(pattern="^(search|info)$")
    query: str | None = Field(default=None, max_length=500)
    url: str | None = Field(default=None, max_length=2000)


@router.post("/api/lyrics")
@limiter.limit("30/minute")
async def scrapling_lyrics(request: Request, body: ScraplingLyricsRequest):
    from scrapling_scraper import fetch_lyrics, is_available

    if not is_available():
        raise HTTPException(status_code=501, detail="Scrapling not installed on server")

    result = await asyncio.to_thread(fetch_lyrics, body.artistName, body.trackName)
    if result:
        return {"plainLyrics": result["plainLyrics"], "syncedLyrics": result["syncedLyrics"]}
    return {"plainLyrics": None, "syncedLyrics": None}


@router.post("/api/bandcamp")
@limiter.limit("30/minute")
async def scrapling_bandcamp(request: Request, body: ScraplingBandcampRequest):
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
    except Exception:
        logger.exception("Bandcamp request failed")
        raise HTTPException(status_code=502, detail="Bandcamp request failed")


@router.post("/api/soundcloud")
@limiter.limit("30/minute")
async def scrapling_soundcloud(request: Request, body: ScraplingSoundcloudRequest):
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
    except Exception:
        logger.exception("SoundCloud request failed")
        raise HTTPException(status_code=502, detail="SoundCloud request failed")
