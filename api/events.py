import asyncio
import json
import logging
import time
from typing import AsyncGenerator

logger = logging.getLogger(__name__)


_MAX_QUEUE_SIZE = 100


class _Subscriber:
    __slots__ = ("queue", "last_get")
    def __init__(self):
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=_MAX_QUEUE_SIZE)
        self.last_get: float = time.time()

    def touch(self):
        self.last_get = time.time()


_subscribers: dict[str, list[_Subscriber]] = {}
_cleanup_interval: int = 300


def subscribe(event_pattern: str) -> _Subscriber:
    sub = _Subscriber()
    _subscribers.setdefault(event_pattern, []).append(sub)
    return sub


def unsubscribe(event_pattern: str | list[str], sub: _Subscriber):
    patterns = event_pattern if isinstance(event_pattern, list) else [event_pattern]
    for p in patterns:
        if p in _subscribers:
            try:
                _subscribers[p].remove(sub)
            except ValueError:
                pass
            if not _subscribers[p]:
                del _subscribers[p]


def _cleanup_stale_queues():
    """Remove subscriber queues that haven't been read in over 2 minutes."""
    now = time.time()
    for pattern, subs in list(_subscribers.items()):
        alive = [s for s in subs if now - s.last_get < 120]
        if alive:
            _subscribers[pattern] = alive
        else:
            del _subscribers[pattern]


async def publish(event: str, data: dict):
    for pattern, subs in list(_subscribers.items()):
        if _match_pattern(event, pattern):
            for sub in subs:
                try:
                    sub.queue.put_nowait({"event": event, "data": data})
                except asyncio.QueueFull:
                    pass
                except Exception:
                    pass


def _match_pattern(event: str, pattern: str) -> bool:
    if pattern.endswith(":*"):
        return event.startswith(pattern[:-1])
    return event == pattern


async def event_stream(
    event_filter: str | None = None,
) -> AsyncGenerator[str, None]:
    patterns = [event_filter] if event_filter else ["*"]
    subs = [subscribe(p) for p in patterns]
    try:
        while True:
            for sub in subs:
                try:
                    data = await asyncio.wait_for(sub.queue.get(), timeout=30)
                    sub.touch()
                    yield f"data: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
    finally:
        for p, sub in zip(patterns, subs):
            unsubscribe(p, sub)
