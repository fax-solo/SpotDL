import re
import logging

logger = logging.getLogger(__name__)

# NOTE: This module is the Python port of the canonical matching logic in
# frontend/src/lib/sources/matching.ts (and its Kotlin port,
# app/src/main/kotlin/com/sinc/enhanced/data/util/MatchScorer.kt).
# Keep normalize/tokenize/noise-word behavior in sync across all three.

# Noise words with Unicode-aware boundaries (lookarounds instead of \b so
# that non-Latin text glued to a noise word is preserved, e.g. "СборникLIVE").
NOISE_WORDS_RE = re.compile(
    r"(?<![\w])(feat|ft|featuring|remastered|remaster|expanded|deluxe|explicit|live|anniversary|version|edit|mix|radio\s*edit|mono|stereo|audio|official|video|lyric|lyrics|hq|hd|4k|1080p|60fps|visualizer|official\s*audio|official\s*video|official\s*lyric|music\s*video|lyric\s*video|full\s*album|single|album\s*version|extended|short|short\s*version)(?![\w])",
    re.IGNORECASE,
)

BRACKET_CONTENT_RE = re.compile(r"\([^)]*\)|\[[^\]]*\]|<[^>]*>")
NON_WORD_RE = re.compile(r"[^\w\s]")
MULTI_SPACE_RE = re.compile(r"\s+")


def normalize(s: str) -> str:
    s = BRACKET_CONTENT_RE.sub(" ", s)
    s = NON_WORD_RE.sub(" ", s)
    s = NOISE_WORDS_RE.sub(" ", s)
    s = MULTI_SPACE_RE.sub(" ", s)
    return s.strip().lower()


def strip_feat(s: str) -> str:
    # Kept for API compatibility: removal of feat-family words is now handled
    # by normalize() itself (matching the TS/Kotlin ports).
    s = NOISE_WORDS_RE.sub(" ", s)
    return MULTI_SPACE_RE.sub(" ", s).strip()


def tokenize(s: str) -> set:
    return set(w for w in s.split() if len(w) > 1)


def word_overlap(expected: set, found: set) -> float:
    if not expected or not found:
        return 0
    common = len(expected & found)
    union = len(expected | found)
    return common / union if union > 0 else 0


def title_matches(
    title: str,
    artist: str,
    found_title: str | None,
    found_uploader: str | None = None,
) -> bool:
    if not found_title:
        return False

    t = normalize(title)
    a = normalize(artist) if artist else ""
    ft = normalize(found_title)
    fu = normalize(found_uploader) if found_uploader else ""

    t_clean = strip_feat(t)
    a_clean = strip_feat(a)
    ft_clean = strip_feat(ft)
    fu_clean = strip_feat(fu)

    t_tokens = tokenize(t_clean)
    a_tokens = tokenize(a_clean)
    ft_tokens = tokenize(ft_clean)

    title_overlap = word_overlap(t_tokens, ft_tokens)
    if title_overlap < 0.4 and t not in ft:
        return False

    if not a:
        return True

    if a in ft:
        return True

    if fu:
        fu_tokens = tokenize(fu_clean)
        artist_overlap = word_overlap(a_tokens, fu_tokens)
        if artist_overlap >= 0.5:
            return True
        if a in fu:
            return True

    if word_overlap(a_tokens, ft_tokens) >= 0.4:
        return True

    return False


def pick_best_match(
    tracks: list[dict],
    expected_title: str,
    expected_artist: str,
    expected_duration: float | None = None,
) -> dict | None:
    t = normalize(expected_title)
    a = normalize(expected_artist)
    t_clean = strip_feat(t)
    a_clean = strip_feat(a)
    a_tokens = tokenize(a_clean)
    t_tokens = tokenize(t_clean)

    best = None
    best_score = 0

    for track in tracks:
        track_title = normalize(track.get("title") or "")
        track_artist = normalize(
            (track.get("artist") or {}).get("name", "")
            if isinstance(track.get("artist"), dict)
            else (track.get("artist") or "")
        )
        track_title_clean = strip_feat(track_title)
        track_artist_clean = strip_feat(track_artist)
        ft_tokens = tokenize(track_title_clean)
        fa_tokens = tokenize(track_artist_clean)

        score = 0

        title_overlap = word_overlap(t_tokens, ft_tokens)
        score += title_overlap * 4

        artist_overlap = word_overlap(a_tokens, fa_tokens)
        score += artist_overlap * 4

        if t_clean == track_title_clean:
            score += 1
        if a_clean == track_artist_clean:
            score += 1

        if expected_duration:
            found_dur = track.get("duration")
            if found_dur and expected_duration > 0 and found_dur > 0:
                ratio = min(expected_duration, found_dur) / max(expected_duration, found_dur)
                if ratio >= 0.9:
                    score += 2

        if score > best_score:
            best_score = score
            best = track

    return best
