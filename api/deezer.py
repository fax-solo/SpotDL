import os
import io
import re
import json
import logging
import tempfile
import requests
from Cryptodome.Cipher import Blowfish
from mutagen.id3 import ID3, TIT2, TPE1, TALB, APIC, error as MutagenError
from mutagen.flac import FLAC as FLACTag, Picture
from mutagen.mp4 import MP4, MP4Cover

logger = logging.getLogger(__name__)

DEEZER_API = "https://api.deezer.com"
DEEZER_GW = "https://www.deezer.com/ajax/gw-light.php"
BLOWFISH_KEY = b"g4el58wc0zvf9na1"
GROUP_SIZE = 2048 * 1803
STEP_SIZE = 2048


class DeezerError(Exception):
    pass


class DeezerClient:
    def __init__(self, arl: str):
        self.arl = arl
        self.session = requests.Session()
        self.session.cookies.set("arl", arl, domain=".deezer.com")
        self.api_token = None
        self.user_id = None
        self.can_stream_lossless = False
        self._authenticate()

    def _authenticate(self):
        resp = self.session.post(
            f"{DEEZER_GW}?method=deezer.getUserData&api_version=1.0&api_token=",
            json={},
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
        if resp.status_code != 200:
            raise DeezerError(f"Failed to reach Deezer auth: {resp.status_code}")

        data = resp.json()
        if data.get("error"):
            raise DeezerError(f"Deezer auth error: {data['error']}")

        results = data.get("results", {})
        self.api_token = results.get("checkForm")
        self.user_id = results.get("USER", {}).get("USER_ID")
        options = results.get("USER", {}).get("OPTIONS", {})
        self.can_stream_lossless = bool(
            options.get("web_lossless", False) or options.get("mobile_lossless", False)
        )

        if not self.api_token:
            raise DeezerError("Failed to get API token — ARL may be invalid")

    def search_track(self, title: str, artist: str) -> dict | None:
        query = f"{artist} {title}"
        resp = self.session.get(
            f"{DEEZER_API}/search?q={requests.utils.quote(query)}&limit=10&order=RANKING",
            timeout=10,
        )
        if resp.status_code != 200:
            return None
        tracks = resp.json().get("data", [])
        if not tracks:
            return None
        return _pick_best_match(tracks, title, artist)

    def search_by_isrc(self, isrc: str) -> dict | None:
        resp = self.session.get(
            f"{DEEZER_API}/search?q=isrc:{isrc}",
            timeout=10,
        )
        if resp.status_code != 200:
            return None
        tracks = resp.json().get("data", [])
        return tracks[0] if tracks else None

    def get_download_info(self, track_id: int) -> dict:
        resp = self.session.post(
            f"{DEEZER_GW}?method=song.getListData&api_version=1.0&api_token={self.api_token}",
            json={"sng_ids": [track_id]},
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
        if resp.status_code != 200:
            raise DeezerError(f"Failed to get download URL: {resp.status_code}")

        data = resp.json()
        if data.get("error"):
            raise DeezerError(f"Deezer API error: {data['error']}")

        results = data.get("results", {})
        tracks_data = results.get("data", [])
        if not tracks_data:
            raise DeezerError("No track data found from Deezer")

        track_data = tracks_data[0]
        media = track_data.get("media", [])
        if not media:
            raise DeezerError("No media sources available (may be DRM-protected)")

        chosen = _pick_best_media(media, self.can_stream_lossless)
        if not chosen:
            chosen = media[0]

        return {
            "url": chosen.get("href"),
            "format": chosen.get("type", "MP3_128"),
            "track_data": track_data,
            "filesize": chosen.get("filesize", 0),
        }

    def search_and_download(
        self,
        title: str,
        artist: str,
        album: str,
        artwork_url: str | None,
        quality: str = "FLAC",
        isrc: str | None = None,
    ) -> tuple[str, str]:
        track = None
        if isrc:
            track = self.search_by_isrc(isrc)
        if not track:
            track = self.search_track(title, artist)
        if not track:
            raise DeezerError(f"No matching track found on Deezer for '{title}' by {artist}")

        deezer_id = track["id"]
        logger.info(f"deezer: matched '{title}' -> Deezer ID {deezer_id} ({track.get('title')} - {track.get('artist', {}).get('name', '')})")
        return self.download_track(deezer_id, title, artist, album, artwork_url, quality)

    def download_track(
        self,
        deezer_id: int,
        title: str,
        artist: str,
        album: str,
        artwork_url: str | None,
        quality: str = "FLAC",
    ) -> tuple[str, str]:
        info = self.get_download_info(deezer_id)
        download_url = info["url"]
        audio_format = info["format"]

        if not download_url:
            raise DeezerError("No download URL returned")

        # Determine whether output is FLAC or MP3
        is_flac = quality == "FLAC" and "FLAC" in audio_format and self.can_stream_lossless

        tmpdir = tempfile.mkdtemp()
        encrypted_path = os.path.join(tmpdir, "encrypted")
        ext = ".flac" if is_flac else ".mp3"
        output_path = os.path.join(tmpdir, f"{_safe(artist)} - {_safe(title)}{ext}")

        try:
            resp = self.session.get(download_url, stream=True, timeout=60)
            if resp.status_code != 200:
                raise DeezerError(f"Download failed: {resp.status_code}")

            _decrypt_stream(resp, encrypted_path)

            if is_flac and _is_flac_file(encrypted_path):
                _tag_flac(encrypted_path, output_path, title, artist, album, artwork_url)
            else:
                _tag_mp3(encrypted_path, output_path, title, artist, album, artwork_url)

            logger.info(f"deezer: SUCCESS {title} - {artist} ({audio_format})")
            return output_path, ext

        except Exception as e:
            import shutil
            shutil.rmtree(tmpdir, ignore_errors=True)
            raise

    def close(self):
        self.session.close()


def _normalize(s: str) -> str:
    return re.sub(r'\([^)]*\)|\[[^\]]*\]', '', s.lower()).strip()

def _tokenize(s: str) -> set:
    return set(re.sub(r'[^\w\s]', ' ', s).split())

def _strip_feat(s: str) -> str:
    return re.sub(r'\b(feat|ft|featuring)\b.*', '', s, flags=re.IGNORECASE).strip()

def _pick_best_match(tracks: list[dict], expected_title: str, expected_artist: str) -> dict | None:
    t = _normalize(expected_title)
    a = _normalize(expected_artist)
    t_clean = _strip_feat(t)
    a_clean = _strip_feat(a)
    a_tokens = _tokenize(a_clean)
    t_tokens = _tokenize(t_clean)

    best = None
    best_score = 0

    def _word_overlap(expected: set, found: set) -> float:
        if not expected or not found:
            return 0
        common = len(expected & found)
        union = len(expected | found)
        return common / union if union > 0 else 0

    for track in tracks:
        track_title = _normalize(track.get("title") or "")
        track_artist = _normalize((track.get("artist") or {}).get("name", ""))
        track_title_clean = _strip_feat(track_title)
        track_artist_clean = _strip_feat(track_artist)
        ft_tokens = _tokenize(track_title_clean)
        fa_tokens = _tokenize(track_artist_clean)

        score = 0

        # Title token overlap (weight: 4)
        title_overlap = _word_overlap(t_tokens, ft_tokens)
        score += title_overlap * 4

        # Artist token overlap (weight: 4)
        artist_overlap = _word_overlap(a_tokens, fa_tokens)
        score += artist_overlap * 4

        # Exact matches get bonus
        if t_clean == track_title_clean:
            score += 1
        if a_clean == track_artist_clean:
            score += 1

        # Duration match if available (weight: 2)
        expected_dur = track.get("duration")
        found_dur = track.get("duration")
        if expected_dur and found_dur and expected_dur > 0 and found_dur > 0:
            ratio = min(expected_dur, found_dur) / max(expected_dur, found_dur)
            if ratio >= 0.9:
                score += 2

        if score > best_score:
            best_score = score
            best = track

    return best


def _pick_best_media(media: list[dict], can_lossless: bool) -> dict | None:
    if can_lossless:
        for fmt in ["FLAC", "MP3_320", "MP3_256", "MP3_128"]:
            for m in media:
                if m.get("type") == fmt and m.get("href"):
                    return m
    else:
        for fmt in ["MP3_320", "MP3_256", "MP3_128"]:
            for m in media:
                if m.get("type") == fmt and m.get("href"):
                    return m
    return None


def _decrypt_stream(response: requests.Response, output_path: str):
    cipher = Blowfish.new(BLOWFISH_KEY, Blowfish.MODE_ECB)
    buffer = bytearray()

    with open(output_path, "wb") as f:
        for raw_chunk in response.iter_content(chunk_size=GROUP_SIZE * 2):
            if not raw_chunk:
                continue
            buffer.extend(raw_chunk)

            while len(buffer) >= GROUP_SIZE:
                group = bytes(buffer[:GROUP_SIZE])
                buffer = buffer[GROUP_SIZE:]

                if len(group) <= STEP_SIZE:
                    if len(group) == STEP_SIZE:
                        f.write(cipher.decrypt(group))
                    else:
                        f.write(group)
                else:
                    f.write(cipher.decrypt(group[:STEP_SIZE]))
                    f.write(group[STEP_SIZE:])

        if buffer:
            remaining = bytes(buffer)
            if len(remaining) <= STEP_SIZE:
                if len(remaining) == STEP_SIZE:
                    f.write(cipher.decrypt(remaining))
                else:
                    f.write(remaining)
            else:
                f.write(cipher.decrypt(remaining[:STEP_SIZE]))
                f.write(remaining[STEP_SIZE:])


def _is_flac_file(path: str) -> bool:
    with open(path, "rb") as f:
        header = f.read(4)
    return header == b"fLaC"


def _tag_flac(src: str, dst: str, title: str, artist: str, album: str, artwork_url: str | None):
    audio = FLACTag(src)
    audio["title"] = title
    audio["artist"] = artist
    audio["album"] = album

    if artwork_url:
        try:
            resp = requests.get(artwork_url, timeout=10)
            if resp.status_code == 200:
                pic = Picture()
                pic.type = 3
                pic.mime = "image/jpeg"
                pic.desc = "Cover"
                pic.data = resp.content
                pic.width = 500
                pic.height = 500
                audio.add_picture(pic)
        except requests.RequestException:
            pass

    audio.save(dst)


def _tag_mp3(src: str, dst: str, title: str, artist: str, album: str, artwork_url: str | None):
    # Copy raw data first (may be FLAC disguised as MP3, or just raw audio)
    with open(src, "rb") as f_in, open(dst, "wb") as f_out:
        f_out.write(f_in.read())

    try:
        audio = ID3(dst)
    except MutagenError:
        audio = ID3()

    audio["TIT2"] = TIT2(encoding=3, text=title)
    audio["TPE1"] = TPE1(encoding=3, text=artist)
    audio["TALB"] = TALB(encoding=3, text=album)

    if artwork_url:
        try:
            resp = requests.get(artwork_url, timeout=10)
            if resp.status_code == 200:
                audio["APIC"] = APIC(
                    encoding=3,
                    mime="image/jpeg",
                    type=3,
                    desc="Cover",
                    data=resp.content,
                )
        except requests.RequestException:
            pass

    audio.save(dst)


def _safe(s: str) -> str:
    return re.sub(r'[^\w\-_., ]', "_", s)
