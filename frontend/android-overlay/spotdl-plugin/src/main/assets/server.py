"""Local HTTP server for native song downloads, runs inside the app."""
import json
import os
import sys
import tempfile
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 9182
MAX_CONTENT_LENGTH = 1 * 1024 * 1024  # 1MB
MAX_CONCURRENT_DOWNLOADS = 2
STALE_TEMP_AGE = 3600  # 1 hour
CLEANUP_INTERVAL = 300  # 5 minutes

HOME_DIR = os.environ.get("SPOTDL_HOME", "/data/data/com.spotdl.app/files")
FFMPEG_PATH = os.environ.get("FFMPEG_PATH", "")
YDL_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "extract_flat": False,
    "ignoreerrors": True,
}

_orphaned_dirs: set[str] = set()
_download_sem = threading.Semaphore(MAX_CONCURRENT_DOWNLOADS)


def _cleanup_orphaned_dirs():
    while True:
        time.sleep(CLEANUP_INTERVAL)
        cutoff = time.time() - STALE_TEMP_AGE
        dirs = list(_orphaned_dirs)
        for d in dirs:
            try:
                if os.path.isdir(d) and os.path.getmtime(d) < cutoff:
                    import shutil
                    shutil.rmtree(d, ignore_errors=True)
                    _orphaned_dirs.discard(d)
            except (OSError, ValueError):
                pass


threading.Thread(target=_cleanup_orphaned_dirs, daemon=True).start()


def fetch_metadata(url):
    """Fetch track metadata using yt-dlp's Spotify extractor."""
    import yt_dlp

    if "open.spotify.com" in url:
        ydl = yt_dlp.YoutubeDL({**YDL_OPTS, "extract_flat": True})
        info = ydl.extract_info(url, download=False)
        if not info:
            return []

        if info.get("_type") == "playlist":
            entries = info.get("entries") or []
            results = []
            for e in entries:
                if e:
                    results.append({
                        "title": e.get("title", "Unknown"),
                        "artist": e.get("artist") or e.get("uploader") or "Unknown",
                        "album": info.get("title", "Unknown"),
                        "artworkUrl": e.get("thumbnail"),
                        "duration": str(e.get("duration", 0)),
                        "url": e.get("webpage_url", ""),
                    })
            return results
        else:
            return [{
                "title": info.get("title", "Unknown"),
                "artist": info.get("artist") or info.get("uploader") or "Unknown",
                "album": info.get("album", "Unknown"),
                "artworkUrl": info.get("thumbnail"),
                "duration": str(info.get("duration", 0)),
                "url": info.get("webpage_url", ""),
            }]

    import ytmusicapi
    ym = ytmusicapi.YTMusic()
    ym.search(url.replace("https://open.spotify.com/", "").split("?")[0].split("/")[-1])
    return []


def download_track(url, output_dir):
    """Download audio track using yt-dlp."""
    import yt_dlp

    os.makedirs(output_dir, exist_ok=True)

    ydl_opts = {
        **YDL_OPTS,
        "format": "bestaudio/best",
        "outtmpl": os.path.join(output_dir, "%(title)s.%(ext)s"),
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }],
    }
    if FFMPEG_PATH:
        ydl_opts["ffmpeg_location"] = FFMPEG_PATH

    ydl = yt_dlp.YoutubeDL(ydl_opts)

    def hook(d):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate", 0)
            downloaded = d.get("downloaded_bytes", 0)
            if total:
                progress = downloaded / total
                print(f"__PROGRESS__:{progress:.4f}:{d.get('_percent_str', '0%').strip()}")

    ydl.add_progress_hook(hook)
    ydl.download([url])


class RequestHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        parsed = urlparse(self.path)
        raw_length = self.headers.get("Content-Length", "0")
        try:
            length = int(raw_length)
        except (ValueError, TypeError):
            self._err("invalid Content-Length", 400)
            return

        if length > MAX_CONTENT_LENGTH:
            self._err(f"request too large ({length} > {MAX_CONTENT_LENGTH} bytes)", 413)
            return

        body = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._err("invalid JSON body", 400)
            return

        if parsed.path == "/metadata":
            try:
                url = data.get("url", "")
                tracks = fetch_metadata(url)
                self._ok({"tracks": tracks})
            except Exception as e:
                self._err(str(e))

        elif parsed.path == "/download":
            acquired = _download_sem.acquire(timeout=300)
            if not acquired:
                self._err("server busy, try again later", 503)
                return
            try:
                url = data.get("url", "")
                track_output = tempfile.mkdtemp(dir=HOME_DIR)
                try:
                    download_track(url, track_output)
                    files = os.listdir(track_output)
                    result = {"files": [os.path.join(track_output, f) for f in files], "output_dir": track_output}
                    self._ok(result)
                except Exception:
                    _orphaned_dirs.add(track_output)
                    raise
            except Exception as e:
                self._err(str(e))
            finally:
                _download_sem.release()

        elif parsed.path == "/health":
            self._ok({"status": "ok"})

        else:
            self._err("unknown endpoint", 404)

    def do_GET(self):
        if self.path == "/health":
            self._ok({"status": "ok"})
        else:
            self._err("not found", 404)

    def _ok(self, data):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _err(self, msg, code=500):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"error": msg}).encode())

    def log_message(self, fmt, *args):
        sys.stderr.write(f"[spotdl-server] {fmt % args}\n")


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), RequestHandler)
    sys.stderr.write(f"[spotdl-server] starting on {HOST}:{PORT}\n")
    server.serve_forever()
