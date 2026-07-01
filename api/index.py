import os
import sys
import time
import json
import logging
import uuid
from contextlib import asynccontextmanager

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

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from database import init_db

from auth import router as auth_router
from admin import router as admin_router
from routes.health import router as health_router
from routes.downloads import router as downloads_router
from routes.metadata import router as metadata_router
from routes.sync import router as sync_router
from routes.scraping import router as scraping_router
from routes.debug import router as debug_router
from routes.spotify_auth import router as spotify_auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Sinc API v2.0.0")
    await init_db()
    logger.info("Database initialized")
    yield
    logger.info("Shutting down Sinc API")


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
app.include_router(debug_router)
app.include_router(spotify_auth_router)

limiter = Limiter(key_func=get_remote_address)
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
        logger.info("%s %s %s %dms", request.method, request.url.path, response.status_code, elapsed_ms)
        return response

app.add_middleware(RequestLogMiddleware)

CLIENT_URL = os.environ.get("CLIENT_URL", "")
_cors_origins = [CLIENT_URL] if CLIENT_URL else ["http://localhost:5173", "http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
