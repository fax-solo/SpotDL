import logging

import httpx

logger = logging.getLogger("smartdl.piped")

PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.adminforge.de",
    "https://piped-api.garudalinux.org",
]


async def _piped_get(path: str, params: dict | None = None) -> dict | None:
    for base in PIPED_INSTANCES:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(f"{base}{path}", params=params)
                if resp.status_code == 200:
                    return resp.json()
        except Exception as e:
            logger.warning("Piped instance %s failed: %s", base, e)
    return None


async def piped_search(query: str) -> list[dict]:
    data = await _piped_get("/search", params={"q": query})
    if not data:
        return []
    items = data.get("items", [])
    results = []
    for item in items:
        if item.get("type") != "stream":
            continue
        results.append({
            "url": item.get("url"),
            "title": item.get("title"),
            "uploader": item.get("uploader"),
            "video_id": item.get("url", "").split("v=")[-1] if "v=" in (item.get("url") or "") else None,
            "duration": item.get("duration"),
        })
    return results


async def piped_streams(video_id: str) -> dict | None:
    return await _piped_get(f"/streams/{video_id}")


async def piped_get_audio_url(artist: str, title: str) -> str | None:
    query = f"{artist} - {title}"
    results = await piped_search(query)
    if not results:
        return None
    for r in results[:3]:
        vid = r.get("video_id")
        if not vid:
            continue
        streams = await piped_streams(vid)
        if not streams:
            continue
        audio_streams = streams.get("audioStreams", [])
        if not audio_streams:
            audio_streams = streams.get("videoStreams", [])
        for s in audio_streams:
            url = s.get("url")
            if url and ("audio" in s.get("mimeType", "") or "mp4" in s.get("mimeType", "")):
                return url
    return None
