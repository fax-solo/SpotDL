import os
import sys
import shutil
import traceback

# Ensure sibling modules are importable on Vercel
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel

from spotify import fetch_metadata

app = FastAPI(title="SpotDL API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DownloadRequest(BaseModel):
    title: str
    artist: str
    album: str = "Unknown Album"
    artwork_url: str | None = None
    url: str | None = None


@app.get("/api/ping")
def ping():
    return {"ok": True}


@app.get("/api/metadata")
def get_metadata(url: str = Query(..., description="Spotify track/album/playlist URL")):
    try:
        data = fetch_metadata(url)
        return {"ok": True, "data": data}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/download")
def download(body: DownloadRequest):
    from downloader import download_track

    try:
        filepath, ext = download_track(body.title, body.artist, body.album, body.artwork_url, body.url)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=str(e))

    def cleanup():
        parent = os.path.dirname(filepath)
        if os.path.isdir(parent):
            shutil.rmtree(parent, ignore_errors=True)

    safe_artist = body.artist.replace("/", "_").replace("\\", "_")
    safe_title = body.title.replace("/", "_").replace("\\", "_")
    filename = f"{safe_artist} - {safe_title}{ext}"
    media_type = "audio/mpeg" if ext == ".mp3" else "audio/mp4"

    return FileResponse(
        path=filepath,
        media_type=media_type,
        filename=filename,
        background=BackgroundTask(cleanup),
    )
