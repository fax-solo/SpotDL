import logging

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from events import event_stream

router = APIRouter(tags=["events"])
logger = logging.getLogger(__name__)
_limiter = Limiter(key_func=get_remote_address)


@router.get("/api/events")
@_limiter.limit("30/minute")
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
