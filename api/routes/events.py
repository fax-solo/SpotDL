import logging

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from shared import limiter
from events import event_stream

router = APIRouter(tags=["events"])
logger = logging.getLogger(__name__)


@router.get("/api/events")
@limiter.limit("30/minute")
async def sse_events(
    request: Request,
    event: str | None = Query(default=None, description="Filter by event pattern (e.g. 'download:*')"),
):
    return StreamingResponse(
        event_stream(event),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
