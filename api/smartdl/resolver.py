import re
import logging

import httpx

logger = logging.getLogger("smartdl.resolver")

SC_CLIENT_ID_CACHE: str | None = None

SCRAPLING_AVAILABLE = False
try:
    from scrapling.fetchers import Fetcher
    from scrapling.parser import Selector
    SCRAPLING_AVAILABLE = True
except ImportError:
    pass


async def _fetch_sc_client_id_scrapling() -> str | None:
    if not SCRAPLING_AVAILABLE:
        return None
    try:
        page = Fetcher.get(
            "https://soundcloud.com",
            impersonate="chrome",
            stealthy_headers=True,
            timeout=12,
        )
        if page is None or page.body is None:
            return None
        html = page.body.decode("utf-8", errors="replace")
        m = re.search(r'"apiClient","data":\{"id":"([^"]+)"', html)
        if m:
            SC_CLIENT_ID_CACHE = m.group(1)
            return SC_CLIENT_ID_CACHE
        m = re.search(r'client_id["\s:=]+"([a-f0-9]+)"', html)
        if m:
            SC_CLIENT_ID_CACHE = m.group(1)
            return SC_CLIENT_ID_CACHE
    except Exception as e:
        logger.warning("Scrapling SoundCloud client_id extraction failed: %s", e)
    return None


async def _fetch_sc_client_id_httpx() -> str | None:
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.get(
                "https://soundcloud.com",
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
                    ),
                },
            )
            if resp.status_code != 200:
                return None
            html = resp.text
            m = re.search(r'"apiClient","data":\{"id":"([^"]+)"', html)
            if m:
                return m.group(1)
            m = re.search(r'client_id["\s:=]+"([a-f0-9]+)"', html)
            if m:
                return m.group(1)
            scripts = re.findall(r'script[^>]+src="([^"]+)"', html)
            for src in scripts[:5]:
                if not src.startswith("http"):
                    src = "https://soundcloud.com" + src
                js_resp = await client.get(src, timeout=10)
                if js_resp.status_code == 200:
                    m2 = re.search(
                        r'client_id["\s:=]+"([a-f0-9]+)"', js_resp.text,
                    )
                    if m2:
                        return m2.group(1)
    except Exception as e:
        logger.warning("httpx SoundCloud client_id extraction failed: %s", e)
    return None


async def _fetch_sc_client_id() -> str | None:
    global SC_CLIENT_ID_CACHE
    if SC_CLIENT_ID_CACHE:
        return SC_CLIENT_ID_CACHE
    cid = await _fetch_sc_client_id_scrapling()
    if cid:
        SC_CLIENT_ID_CACHE = cid
        return cid
    cid = await _fetch_sc_client_id_httpx()
    if cid:
        SC_CLIENT_ID_CACHE = cid
        return cid
    return None


async def search_soundcloud(query: str) -> list[dict]:
    client_id = await _fetch_sc_client_id()
    if not client_id:
        return []
    try:
        params = {"q": query, "client_id": client_id, "limit": 5, "offset": 0}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api-v2.soundcloud.com/search/tracks",
                params=params,
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
            collection = data.get("collection", [])
            results = []
            for track in collection:
                if not track or not track.get("permalink_url"):
                    continue
                transcodings = track.get("media", {}).get("transcodings", [])
                stream_url = None
                for tc in transcodings:
                    url = tc.get("url", "")
                    preset = tc.get("preset", "")
                    if "mp3" in preset or "opus" in preset:
                        stream_url = url
                        break
                results.append({
                    "url": track["permalink_url"],
                    "title": track.get("title"),
                    "uploader": track.get("user", {}).get("username"),
                    "stream_url": stream_url,
                    "duration": track.get("duration", 0) / 1000.0,
                })
            return results
    except Exception as e:
        logger.warning("SoundCloud search failed: %s", e)
        return []


async def resolve_soundcloud_stream(track_url: str) -> str | None:
    client_id = await _fetch_sc_client_id()
    if not client_id:
        return None
    try:
        resolve_params = {"url": track_url, "client_id": client_id}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api-v2.soundcloud.com/resolve",
                params=resolve_params,
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            transcodings = data.get("media", {}).get("transcodings", [])
            for tc in transcodings:
                preset = tc.get("preset", "")
                url = tc.get("url", "")
                if "mp3" in preset and url:
                    prog_resp = await client.get(
                        url, params={"client_id": client_id},
                    )
                    if prog_resp.status_code == 200:
                        prog_data = prog_resp.json()
                        stream_url = prog_data.get("url")
                        if stream_url:
                            return stream_url
    except Exception as e:
        logger.warning("SoundCloud resolve failed: %s", e)
    return None
