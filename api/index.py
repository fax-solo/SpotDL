import os
import sys
import time
import json
import logging
import uuid
import asyncio
from contextlib import asynccontextmanager
from urllib.parse import urlparse

logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s | %(name)s | %(message)s',
)
logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from database import init_db
from shared import limiter, metrics

from auth import router as auth_router
from admin import router as admin_router
from routes.health import router as health_router
from routes.downloads import router as downloads_router
from routes.metadata import router as metadata_router
from routes.sync import router as sync_router
from routes.scraping import router as scraping_router
from routes.resolve import router as resolve_router
from shared import DEBUG_MODE
from routes.debug import router as debug_router
from routes.spotify_auth import router as spotify_auth_router
from routes.events import router as events_router
from routes.metrics import router as metrics_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Sinc API v2.0.0")
    await init_db()
    logger.info("Database initialized")
    yield
    logger.info("Shutting down Sinc API")
    tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    for t in tasks:
        t.cancel()
    if tasks:
        await asyncio.wait(tasks, timeout=5)


app = FastAPI(title="Sinc API", version="2.0.0", lifespan=lifespan)

AVATAR_DIR = os.path.join(os.path.dirname(__file__), "data", "avatars")
os.makedirs(AVATAR_DIR, exist_ok=True)

app.mount("/api/avatars", StaticFiles(directory=AVATAR_DIR), name="avatars")

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(health_router)
app.include_router(downloads_router)
app.include_router(metadata_router)
app.include_router(sync_router)
app.include_router(scraping_router)
app.include_router(resolve_router)
if DEBUG_MODE:
    app.include_router(debug_router)
app.include_router(spotify_auth_router)
app.include_router(events_router)
app.include_router(metrics_router)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

class RequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        req_id = uuid.uuid4().hex[:12]
        start = time.time()
        response = await call_next(request)
        elapsed_ms = int((time.time() - start) * 1000)
        response.headers["X-Request-Id"] = req_id
        response.headers["X-Response-Time-Ms"] = str(elapsed_ms)
        metrics.inc(f"http.{response.status_code}", 1)
        metrics.record(f"http.{request.method}.{request.url.path}", time.time() - start)
        logger.info("%s %s %s %dms", request.method, request.url.path, response.status_code, elapsed_ms)
        return response

app.add_middleware(RequestLogMiddleware)

ALLOWED_ORIGINS_STR = os.environ.get("ALLOWED_ORIGINS", "")
_allowed_origins = [o.strip() for o in ALLOWED_ORIGINS_STR.split(",") if o.strip()]
CLIENT_URL = os.environ.get("CLIENT_URL", "")
_cors_origins = _allowed_origins if _allowed_origins else ([CLIENT_URL] if CLIENT_URL else ["http://localhost:5173", "http://localhost:3000"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), interest-cohort=()"
        if not response.headers.get("Strict-Transport-Security"):
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        return response

app.add_middleware(SecurityHeadersMiddleware)

class CSRFMiddleware(BaseHTTPMiddleware):
    SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

    async def dispatch(self, request: Request, call_next):
        if request.method not in self.SAFE_METHODS:
            request_origin = None
            origin = request.headers.get("Origin")
            referer = request.headers.get("Referer")

            if origin:
                try:
                    origin_parsed = urlparse(origin)
                    request_origin = f"{origin_parsed.scheme}://{origin_parsed.netloc}".lower()
                except Exception:
                    return JSONResponse(status_code=403, content={"detail": "Invalid Origin header"})
            elif referer:
                try:
                    ref_parsed = urlparse(referer)
                    request_origin = f"{ref_parsed.scheme}://{ref_parsed.netloc}".lower()
                except Exception:
                    return JSONResponse(status_code=403, content={"detail": "Invalid Referer header"})
            else:
                # No Origin or Referer — this is a native app or non-browser client.
                # CSRF is not applicable since browser-based cross-origin requests
                # always include an Origin header.
                return await call_next(request)

            if request_origin:
                allowed = [o.lower() for o in _cors_origins]
                if not any(request_origin == o for o in allowed):
                    return JSONResponse(status_code=403, content={"detail": "CSRF: Invalid origin"})
        return await call_next(request)

app.add_middleware(CSRFMiddleware)
