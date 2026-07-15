import re
import logging

import httpx
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import musicbrainzngs

logger = logging.getLogger("smartdl.metadata")

SPOTIFY_CLIENT_ID = ""
SPOTIFY_CLIENT_SECRET = ""
SPOTIFY_URL_RE = re.compile(r"open\.spotify\.com/track/([a-zA-Z0-9]+)")

musicbrainzngs.set_useragent("SmartDL/1.0", "https://github.com/example")

THEAUDIO_DB_BASE = "https://www.theaudiodb.com/api/v1/json/2"


def configure(client_id: str, client_secret: str):
    global SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, _spotify_client
    SPOTIFY_CLIENT_ID = client_id
    SPOTIFY_CLIENT_SECRET = client_secret
    _spotify_client = None


_spotify_client: spotipy.Spotify | None = None


def _get_spotify() -> spotipy.Spotify | None:
    global _spotify_client
    if _spotify_client is not None:
        return _spotify_client
    if SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET:
        auth = SpotifyClientCredentials(
            client_id=SPOTIFY_CLIENT_ID,
            client_secret=SPOTIFY_CLIENT_SECRET,
        )
        _spotify_client = spotipy.Spotify(auth_manager=auth)
        return _spotify_client
    return None


class TrackMetadata:
    def __init__(
        self,
        title: str,
        artist: str,
        album: str,
        cover_art_url: str | None = None,
        duration_seconds: float = 0.0,
        isrc: str | None = None,
        source: str = "unknown",
    ):
        self.title = title
        self.artist = artist
        self.album = album
        self.cover_art_url = cover_art_url
        self.duration_seconds = duration_seconds
        self.isrc = isrc
        self.source = source

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "artist": self.artist,
            "album": self.album,
            "cover_art_url": self.cover_art_url,
            "duration_seconds": self.duration_seconds,
            "isrc": self.isrc,
            "source": self.source,
        }


def _search_spotify(query: str) -> list[TrackMetadata]:
    sp = _get_spotify()
    if not sp:
        return []
    try:
        results = sp.search(q=query, type="track", limit=5)
        tracks = results.get("tracks", {}).get("items", [])
        if not tracks:
            return []
        out = []
        for t in tracks:
            images = t.get("album", {}).get("images", [])
            cover = images[0]["url"] if images else None
            duration_ms = t.get("duration_ms", 0)
            out.append(TrackMetadata(
                title=t["name"],
                artist=", ".join(a["name"] for a in t.get("artists", [])),
                album=t.get("album", {}).get("name", "Unknown"),
                cover_art_url=cover,
                duration_seconds=duration_ms / 1000.0,
                isrc=t.get("external_ids", {}).get("isrc"),
                source="spotify",
            ))
        return out
    except Exception as e:
        logger.warning("Spotify search failed: %s", e)
        return []


def _fetch_spotify_track(track_id: str) -> TrackMetadata | None:
    sp = _get_spotify()
    if not sp:
        return None
    try:
        t = sp.track(track_id)
        images = t.get("album", {}).get("images", [])
        cover = images[0]["url"] if images else None
        duration_ms = t.get("duration_ms", 0)
        return TrackMetadata(
            title=t["name"],
            artist=", ".join(a["name"] for a in t.get("artists", [])),
            album=t.get("album", {}).get("name", "Unknown"),
            cover_art_url=cover,
            duration_seconds=duration_ms / 1000.0,
            isrc=t.get("external_ids", {}).get("isrc"),
            source="spotify",
        )
    except Exception as e:
        logger.warning("Spotify track fetch failed: %s", e)
        return None


def _search_musicbrainz(artist: str, title: str) -> list[TrackMetadata]:
    try:
        if artist:
            query = f'artist:"{artist}" AND recording:"{title}"'
        else:
            query = title
        result = musicbrainzngs.search_recordings(query=query, limit=5)
        recordings = result.get("recording-list", [])
        if not recordings:
            return []
        out = []
        for rec in recordings:
            artist_name = "Unknown"
            if rec.get("artist-credit"):
                artist_name = " & ".join(
                    c.get("artist", {}).get("name", "Unknown")
                    for c in rec["artist-credit"]
                    if isinstance(c, dict)
                )
            album_name = "Unknown"
            release_list = rec.get("release-list", [])
            if release_list:
                album_name = release_list[0].get("title", "Unknown")
            duration = 0
            if rec.get("length"):
                duration = int(rec["length"]) / 1000.0
            out.append(TrackMetadata(
                title=rec.get("title", "Unknown"),
                artist=artist_name,
                album=album_name,
                cover_art_url=None,
                duration_seconds=duration,
                source="musicbrainz",
            ))
        return out
    except Exception as e:
        logger.warning("MusicBrainz search failed: %s", e)
        return []


def _search_theaudiodb(artist: str, title: str) -> list[TrackMetadata]:
    try:
        resp = httpx.get(
            f"{THEAUDIO_DB_BASE}/searchtrack.php",
            params={"s": artist, "t": title},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        tracks = data.get("track", [])
        if not tracks:
            return []
        out = []
        for t in tracks:
            cover = t.get("strTrackThumb") or t.get("strAlbumThumb")
            duration_str = t.get("intDuration", "0")
            try:
                duration = int(duration_str) / 1000.0 if duration_str else 0
            except ValueError:
                duration = 0
            out.append(TrackMetadata(
                title=t.get("strTrack", "Unknown"),
                artist=t.get("strArtist", "Unknown"),
                album=t.get("strAlbum", "Unknown"),
                cover_art_url=cover,
                duration_seconds=duration,
                source="theaudiodb",
            ))
        return out
    except Exception as e:
        logger.warning("TheAudioDB search failed: %s", e)
        return []


def resolve_metadata(query: str) -> list[TrackMetadata]:
    m = SPOTIFY_URL_RE.search(query)
    if m:
        track = _fetch_spotify_track(m.group(1))
        if track:
            return [track]
        return []

    results = _search_spotify(query)
    if results:
        return results

    parts = query.rsplit(" - ", 1)
    artist = parts[0].strip() if len(parts) > 1 else ""
    title = parts[-1].strip()
    if artist:
        results = _search_musicbrainz(artist, title)
        if results:
            return results
        results = _search_theaudiodb(artist, title)
        if results:
            return results

    results = _search_musicbrainz("", query)
    if results:
        return results

    words = query.split()
    if len(words) >= 2:
        mid = len(words) // 2
        artist_candidate = " ".join(words[:mid])
        title_candidate = " ".join(words[mid:])
        results = _search_musicbrainz(artist_candidate, title_candidate)
        if results:
            return results

    return []
