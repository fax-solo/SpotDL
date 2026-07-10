import asyncio
import json
import logging
from typing import AsyncGenerator

logger = logging.getLogger(__name__)

_subscribers: dict[str, list[asyncio.Queue]] = {}


def subscribe(event_pattern: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.setdefault(event_pattern, []).append(q)
    return q


def unsubscribe(event_pattern: str, q: asyncio.Queue):
    if event_pattern in _subscribers:
        _subscribers[event_pattern].remove(q)
        if not _subscribers[event_pattern]:
            del _subscribers[event_pattern]


async def publish(event: str, data: dict):
    for pattern, queues in list(_subscribers.items()):
        if _match_pattern(event, pattern):
            for q in queues:
                await q.put({"event": event, "data": data})


def _match_pattern(event: str, pattern: str) -> bool:
    if pattern.endswith(":*"):
        return event.startswith(pattern[:-1])
    return event == pattern


async def event_stream(
    event_filter: str | None = None,
) -> AsyncGenerator[str, None]:
    patterns = [event_filter] if event_filter else ["*"]
    queues = [subscribe(p) for p in patterns]
    try:
        while True:
            for q in queues:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=30)
                    yield f"data: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
    finally:
        for p, q in zip(patterns, queues):
            unsubscribe(p, q)
