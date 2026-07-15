import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query, Request

from shared import limiter
from spotify import fetch_metadata

router = APIRouter(tags=["metadata"])
logger = logging.getLogger(__name__)


@router.get("/api/metadata")
@limiter.limit("60/minute")
async def get_metadata(request: Request, url: str = Query(..., description="Spotify track/album/playlist URL")):
    try:
        data = await asyncio.to_thread(fetch_metadata, url)
        return {"ok": True, "data": data}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logger.exception("Metadata fetch failed")
        raise HTTPException(status_code=502, detail="Metadata fetch failed")
