import os
import logging
import yt_dlp

from _matching import title_matches, pick_best_match
from sources import DownloadSource, SearchResult

logger = logging.getLogger(__name__)

BASE_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "source_address": "0.0.0.0",
    "extractor_retries": 3,
    "retries": 5,
    "throttled_rate": "100K",
    "concurrent_fragments": 5,
    "fragment_retries": 10,
    "file_access_retries": 3,
    "no_mtime": True,
    "no_part": True,
}


class YouTubeSource(DownloadSource):
    name = "youtube"

    def search(self, title: str, artist: str) -> list[SearchResult]:
        query = f"{artist} {title}"
        opts = {
            **BASE_OPTS,
            "extract_flat": False,
            "default_search": "ytsearch1",
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(f"ytsearch1:{query}", download=False)
                if not info or "entries" not in info or not info["entries"]:
                    return []
                results = []
                for entry in info["entries"]:
                    if not entry:
                        continue
                    url = entry.get("url") or entry.get("webpage_url")
                    if url:
                        results.append(SearchResult(
                            url=url,
                            title=entry.get("title"),
                            uploader=entry.get("uploader") or entry.get("channel") or entry.get("creator"),
                            source=self.name,
                        ))
                return results
        except Exception as e:
            logger.warning("YouTube search failed for '%s': %s", query, e)
            return []

    def download(
        self,
        track_url: str,
        tmpdir: str,
        output_path: str,
        quality: str = "320",
        output_format: str = "mp3",
    ) -> str | None:
        opts = {
            **BASE_OPTS,
            "outtmpl": os.path.join(tmpdir, "%(title)s.%(ext)s"),
            "format": "bestaudio/best",
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": output_format if output_format in ("mp3", "m4a") else "mp3",
                    "preferredquality": quality,
                }
            ],
        }
        if "youtube.com" in track_url or "youtu.be" in track_url:
            opts["extractor_args"] = {"youtube": {"client": ["android", "ios"]}}

        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([track_url])
            files = [f for f in os.listdir(tmpdir) if not f.endswith('.part')]
            if not files:
                return None
            files.sort()
            ext_expected = output_format if output_format in ("mp3", "m4a") else "mp3"
            expected = f"{os.path.splitext(os.path.basename(output_path))[0]}.{ext_expected}"
            return os.path.join(tmpdir, expected if expected in files else files[0])
        except yt_dlp.DownloadError as e:
            if "DRM" in str(e):
                logger.warning("YouTube track is DRM protected: %s", track_url)
                return None
            raise

    def confidence_threshold(self) -> float:
        return 0.4
