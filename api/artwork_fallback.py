"""Server-side artwork fallback chain.
Tries multiple free sources in order until artwork is found.

Canonical chain (order matters — prefer the most reliable metadata, then the
most permissive sources). Keep in sync with:
  - frontend/functions/api/_lib/artworkFallback.ts (Cloudflare Functions)
  - app/src/main/kotlin/com/sinc/enhanced/data/remote/ArtworkClient.kt (Android)
Chain order: deezer -> itunes -> lastfm -> coverartarchive
Artwork selection: deezer cover_big -> cover_medium; itunes 600x600; lastfm
extralarge -> large -> medium -> last image; coverartarchive front-250."""

import os
import re
import logging
import urllib.parse

import requests
from shared import requests_retry_session

logger = logging.getLogger(__name__)

_session = requests_retry_session()

LASTFM_API_KEY = os.environ.get("LASTFM_API_KEY", "7a5d0a2a4b1e8c3f6d9e0f1a2b3c4d5e")


def find_artwork(title: str, artist: str, isrc: str | None = None) -> str | None:
    if not title and not artist:
        return None

    sources = [
        ("deezer", _deezer_artwork),
        ("itunes", _itunes_artwork),
        ("lastfm", _lastfm_artwork),
        ("coverartarchive", _coverartarchive_artwork),
    ]

    for name, fn in sources:
        try:
            url = None
            if name == "coverartarchive":
                url = fn(title, artist, isrc)
            else:
                url = fn(title, artist)
            if url:
                logger.info("artwork_fallback: found via %s for %s - %s", name, artist, title)
                return url
        except Exception as e:
            logger.debug("artwork_fallback: %s failed for %s - %s: %s", name, artist, title, e)

    return None


def _deezer_artwork(title: str, artist: str) -> str | None:
    query = urllib.parse.quote(f"{artist} {title}")
    try:
        resp = _session.get(
            f"https://api.deezer.com/search?q={query}&limit=3&order=RANKING",
            timeout=8,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        track = (data.get("data") or [None])[0]
        if not track:
            return None
        album = track.get("album") or {}
        return album.get("cover_big") or album.get("cover_medium") or None
    except Exception as e:
        logger.debug("Deezer artwork failed: %s", e)
        return None


def _itunes_artwork(title: str, artist: str) -> str | None:
    query = urllib.parse.quote(f"{artist} {title}")
    try:
        resp = _session.get(
            f"https://itunes.apple.com/search?term={query}&media=music&limit=3",
            timeout=8,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        results = data.get("results") or []
        for track in results:
            if track.get("kind") == "song" and track.get("artworkUrl100"):
                return track["artworkUrl100"].replace("100x100", "600x600")
        return None
    except Exception as e:
        logger.debug("iTunes artwork failed: %s", e)
        return None


def _lastfm_artwork(title: str, artist: str) -> str | None:
    params = {
        "method": "track.getInfo",
        "api_key": LASTFM_API_KEY,
        "artist": artist,
        "track": title,
        "format": "json",
        "autocorrect": "1",
    }
    try:
        resp = _session.get(
            "https://ws.audioscrobbler.com/2.0/",
            params=params,
            timeout=8,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        if data.get("error"):
            return None
        track = data.get("track")
        if not track:
            return None
        album = track.get("album")
        if not album:
            return None
        images = album.get("image") or []
        for size in ("extralarge", "large", "medium"):
            for img in images:
                if img.get("size") == size and img.get("#text"):
                    return img["#text"]
        if images and images[-1].get("#text"):
            return images[-1]["#text"]
        return None
    except Exception as e:
        logger.debug("Last.fm artwork failed: %s", e)
        return None


def _coverartarchive_artwork(title: str, artist: str, isrc: str | None = None) -> str | None:
    release_mbid = None

    mbid_url = "https://musicbrainz.org/ws/2"

    if isrc:
        try:
            resp = _session.get(
                f"{mbid_url}/recording/?query=isrc:{isrc}&limit=1&fmt=json",
                headers={"User-Agent": "Sinc/1.0"},
                timeout=8,
            )
            if resp.status_code == 200:
                data = resp.json()
                recs = data.get("recordings") or []
                if recs:
                    releases = recs[0].get("releases") or []
                    if releases:
                        release_mbid = releases[0]["id"]
        except Exception as e:
            logger.debug("MusicBrainz ISRC lookup failed: %s", e)

    if not release_mbid and artist and title:
        try:
            query = urllib.parse.quote(f'artist:"{artist}" AND recording:"{title}"')
            resp = _session.get(
                f"{mbid_url}/recording/?query={query}&limit=3&fmt=json",
                headers={"User-Agent": "Sinc/1.0"},
                timeout=8,
            )
            if resp.status_code == 200:
                data = resp.json()
                recs = data.get("recordings") or []
                for rec in recs:
                    releases = rec.get("releases") or []
                    if releases:
                        release_mbid = releases[0]["id"]
                        break
        except Exception as e:
            logger.debug("MusicBrainz track lookup failed: %s", e)

    if not release_mbid:
        return None

    try:
        resp = _session.get(
            f"https://coverartarchive.org/release/{release_mbid}/front-250",
            timeout=8,
        )
        if resp.status_code == 200:
            return f"https://coverartarchive.org/release/{release_mbid}/front-250"
        if resp.status_code != 404:
            logger.debug("Cover Art Archive returned %s for %s", resp.status_code, release_mbid)
        return None
    except Exception as e:
        logger.debug("Cover Art Archive failed: %s", e)
        return None
