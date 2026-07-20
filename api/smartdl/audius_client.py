import logging
import httpx

logger = logging.getLogger("smartdl.audius")

AUDIUS_API = "https://api.audius.co"

AUDIUS_TIMEOUT = httpx.Timeout(15.0, connect=8.0)


async def _audius_get(path: str) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=AUDIUS_TIMEOUT) as client:
            resp = await client.get(
                f"{AUDIUS_API}{path}",
                headers={"User-Agent": "Sinc/1.0"},
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning("Audius request failed: %s", e)
    return None


async def audius_search(query: str, limit: int = 5) -> list[dict]:
    data = await _audius_get(f"/v1/tracks/search?query={httpx.escape(query)}&limit={limit}")
    if not data or "data" not in data:
        return []
    results = []
    for t in data["data"]:
        user = t.get("user", {}) or {}
        results.append({
            "id": t.get("id"),
            "title": t.get("title", "Unknown"),
            "uploader": user.get("name") or user.get("handle", "Unknown"),
            "url": t.get("id"),
            "duration": t.get("duration", 0),
            "downloadable": t.get("downloadable", False),
            "stream_url": f"{AUDIUS_API}/v1/tracks/{t['id']}/stream" if t.get("id") else None,
        })
    return results


async def audius_get_audio_url(artist: str, title: str) -> str | None:
    query = f"{artist} - {title}"
    results = await audius_search(query, limit=3)
    for r in results:
        stream = r.get("stream_url")
        if stream:
            logger.info("audius: found stream for %s - %s", artist, title)
            return stream
        if r.get("downloadable") and r.get("id"):
            dl_url = f"{AUDIUS_API}/v1/tracks/{r['id']}/download"
            logger.info("audius: found download for %s - %s", artist, title)
            return dl_url
    return None
