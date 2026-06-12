import os
import shutil

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel

from spotify import fetch_metadata
from downloader import download_track

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


@app.get("/api/metadata")
def get_metadata(url: str = Query(..., description="Spotify track/album/playlist URL")):
    try:
        data = fetch_metadata(url)
        return {"ok": True, "data": data}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/download")
def download(body: DownloadRequest):
    try:
        filepath = download_track(body.title, body.artist, body.album, body.artwork_url)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    def cleanup():
        parent = os.path.dirname(filepath)
        if os.path.isdir(parent):
            shutil.rmtree(parent, ignore_errors=True)

    filename = f"{body.artist} - {body.title}.mp3".replace("/", "_")
    return FileResponse(
        path=filepath,
        media_type="audio/mpeg",
        filename=filename,
        background=BackgroundTask(cleanup),
    )
