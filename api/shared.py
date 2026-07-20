import os
import re
import time
import random
import asyncio
import secrets
import threading
import logging
from functools import wraps

import requests
from fastapi import HTTPException, Request
from requests.adapters import HTTPAdapter
from slowapi import Limiter
from slowapi.util import get_remote_address
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

DOWNLOAD_SEMAPHORE_LIMIT = int(os.environ.get("SPOTDL_CONCURRENT_DOWNLOADS", "4"))
_download_semaphore = asyncio.Semaphore(DOWNLOAD_SEMAPHORE_LIMIT)

def active_downloads() -> int:
    return DOWNLOAD_SEMAPHORE_LIMIT - _download_semaphore._value

API_KEY = os.environ.get("SPOTDL_API_KEY", "")
if not API_KEY:
    logger.warning("SPOTDL_API_KEY is not set — download/sync endpoints are UNPROTECTED. Set this env var in production.")
DEBUG_MODE = os.environ.get("SPOTDL_DEBUG", "").lower() in ("1", "true", "yes")

limiter = Limiter(key_func=get_remote_address)

# ─── Retry wrapper ───

MAX_RETRIES = 3
BASE_DELAY = 1.0

def sync_retry(max_retries=MAX_RETRIES, base_delay=BASE_DELAY, exceptions=(requests.ConnectionError, requests.Timeout, ConnectionError, TimeoutError, OSError)):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exc = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exc = e
                    if attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt) + random.uniform(0, 0.1)
                        time.sleep(delay)
            raise last_exc
        return wrapper
    return decorator

def async_retry(max_retries=MAX_RETRIES, base_delay=BASE_DELAY, exceptions=(Exception,)):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_exc = None
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    last_exc = e
                    if attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt) + random.uniform(0, 0.1)
                        await asyncio.sleep(delay)
            raise last_exc
        return wrapper
    return decorator

def requests_retry_session(retries=3, backoff_factor=0.5, status_forcelist=(429, 500, 502, 503, 504)):
    session = requests.Session()
    retry = Retry(
        total=retries,
        read=retries,
        connect=retries,
        backoff_factor=backoff_factor,
        status_forcelist=status_forcelist,
        allowed_methods={'GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'},
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session

# ─── Circuit breaker ───

class CircuitBreaker:
    __slots__ = ("name", "threshold", "reset_after", "_failures", "_lock")

    def __init__(self, name: str, threshold: int = 3, reset_after: float = 60.0):
        self.name = name
        self.threshold = threshold
        self.reset_after = reset_after
        self._failures: list[float] = []
        self._lock = threading.Lock()

    def record_failure(self):
        with self._lock:
            self._failures.append(time.time())
            self._prune()

    def record_success(self):
        with self._lock:
            self._failures.clear()

    def is_open(self) -> bool:
        with self._lock:
            self._prune()
            return len(self._failures) >= self.threshold

    def _prune(self):
        now = time.time()
        self._failures = [f for f in self._failures if now - f < self.reset_after]

_source_circuit_breakers: dict[str, CircuitBreaker] = {}
_source_cb_lock = threading.Lock()

def get_circuit_breaker(name: str, threshold: int = 3, reset_after: float = 60.0) -> CircuitBreaker:
    with _source_cb_lock:
        if name not in _source_circuit_breakers:
            _source_circuit_breakers[name] = CircuitBreaker(name, threshold, reset_after)
        return _source_circuit_breakers[name]

def source_is_open(name: str) -> bool:
    cb = _source_circuit_breakers.get(name)
    return cb.is_open() if cb else False


# ─── Metrics ───

class Metrics:
    __slots__ = ("_counters", "_timings")

    def __init__(self):
        self._counters: dict[str, int] = {}
        self._timings: dict[str, list[float]] = {}

    def inc(self, key: str, n: int = 1):
        self._counters[key] = self._counters.get(key, 0) + n

    def record(self, key: str, elapsed: float):
        self._timings.setdefault(key, []).append(elapsed)
        if len(self._timings[key]) > 100:
            self._timings[key] = self._timings[key][-100:]

    def snapshot(self) -> dict:
        now = time.time()
        uptime_s = int(now - _start_time) if _start_time else 0
        timings_summary = {}
        for k, vals in self._timings.items():
            if vals:
                vals.sort()
                n = len(vals)
                timings_summary[k] = {
                    "count": n,
                    "avg_ms": round(sum(vals) / n * 1000, 1),
                    "p50_ms": round(vals[n // 2] * 1000, 1),
                    "p95_ms": round(vals[int(n * 0.95)] * 1000, 1),
                    "p99_ms": round(vals[int(n * 0.99)] * 1000, 1),
                }
        return {
            "uptime_s": uptime_s,
            "counters": dict(self._counters),
            "timings": timings_summary,
        }

_start_time: float = time.time()
metrics = Metrics()


def verify_api_key(request: Request):
    if not API_KEY:
        return True
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer ") and secrets.compare_digest(auth[7:], API_KEY):
        return True
    raise HTTPException(status_code=401, detail="Invalid or missing API key")
