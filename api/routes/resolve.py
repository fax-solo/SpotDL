import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from shared import verify_api_key, limiter

router = APIRouter(tags=["resolve"])
logger = logging.getLogger(__name__)


class ResolveRequest(BaseModel):
    title: str = Field(max_length=500)
    artist: str = Field(max_length=500)
    album: str | None = Field(default=None, max_length=500)
    isrc: str | None = Field(default=None, max_length=50)
    duration_ms: int | None = Field(default=None, ge=0)


@router.post("/api/resolve-audio")
@limiter.limit("30/minute")
async def resolve_audio(request: Request, body: ResolveRequest, _auth=Depends(verify_api_key)):
    from downloader import resolve_audio as _resolve

    try:
        result = await asyncio.to_thread(_resolve, body.title, body.artist, body.album, body.isrc, body.duration_ms)
        if result is None:
            raise HTTPException(status_code=502, detail="No audio URL found")
        return {"ok": True, **result}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Resolve failed for '%s' by '%s'", body.title, body.artist)
        raise HTTPException(status_code=502, detail="Audio resolution failed")
