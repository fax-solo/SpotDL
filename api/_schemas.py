from pydantic import BaseModel, Field
from typing import Any


class TrackMetadata(BaseModel):
    title: str
    artist: str
    album: str = "Unknown Album"
    artwork_url: str | None = None
    url: str
    type: str = "track"
    duration_ms: int | None = None
    isrc: str | None = None


class CollectionMetadata(BaseModel):
    collection_name: str
    collection_artwork: str | None = None
    collection_type: str
    tracks: list[TrackMetadata]


class DownloadRequest(BaseModel):
    title: str = Field(max_length=500)
    artist: str = Field(max_length=500)
    album: str = Field(default="Unknown Album", max_length=500)
    artwork_url: str | None = Field(default=None, max_length=2000)
    url: str | None = Field(default=None, max_length=2000)
    quality: str | None = Field(default=None, pattern="^(128|192|256|320)$", max_length=3)
    format: str | None = Field(default=None, pattern="^(mp3|m4a)$", max_length=3)


class DeezerDownloadRequest(BaseModel):
    arl: str = Field(min_length=1, max_length=200)
    title: str = Field(max_length=500)
    artist: str = Field(max_length=500)
    album: str = Field(default="Unknown Album", max_length=500)
    artwork_url: str | None = Field(default=None, max_length=2000)
    quality: str = Field(default="FLAC", pattern="^(FLAC|MP3)$", max_length=4)
    isrc: str | None = Field(default=None, max_length=50)


class SyncResult(BaseModel):
    total: int = 0
    new: int = 0
    downloaded: int = 0
    failed: int = 0
    errors: list[str] = []
    playlist_name: str | None = None


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None
