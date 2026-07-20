import logging
import httpx

logger = logging.getLogger("smartdl.invidious")

INVIDIOUS_INSTANCES = [
    "https://inv.nadeko.net",
    "https://yt.artemislena.eu",
    "https://invidious.private.coffee",
    "https://invidious.privacydev.net",
    "https://invidious.no-logs.com",
    "https://invidious.slipfox.xyz",
    "https://vid.puffyan.us",
]

INVIDIOUS_TIMEOUT = httpx.Timeout(12.0, connect=6.0)


async def _invidious_get(path: str) -> dict | list | None:
    for base in INVIDIOUS_INSTANCES:
        try:
            async with httpx.AsyncClient(timeout=INVIDIOUS_TIMEOUT) as client:
                resp = await client.get(
                    f"{base}{path}",
                    headers={"User-Agent": "Sinc/1.0"},
                )
                if resp.status_code == 200:
                    return resp.json()
        except Exception:
            continue
    return None


async def invidious_search(query: str, limit: int = 5) -> list[dict]:
    data = await _invidious_get(f"/api/v1/search?q={httpx.escape(query)}&type=video")
    if not data or not isinstance(data, list):
        return []
    results = []
    for v in data:
        if not isinstance(v, dict) or not v.get("videoId"):
            continue
        results.append({
            "videoId": v["videoId"],
            "title": v.get("title", "Unknown"),
            "uploader": v.get("author", "Unknown"),
            "duration": v.get("lengthSeconds", 0),
            "url": f"https://youtube.com/watch?v={v['videoId']}",
        })
        if len(results) >= limit:
            break
    return results


async def invidious_get_audio_url(video_id: str) -> str | None:
    data = await _invidious_get(f"/api/v1/videos/{video_id}")
    if not data or not isinstance(data, dict):
        return None
    formats = data.get("adaptiveFormats", []) or []
    audio = [
        f for f in formats
        if isinstance(f, dict) and f.get("type", "").startswith("audio/") and f.get("url")
    ]
    if not audio:
        return None
    audio.sort(key=lambda f: int(f.get("bitrate", 0) or 0), reverse=True)
    return audio[0]["url"]
