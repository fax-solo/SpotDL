import re
import logging

logger = logging.getLogger(__name__)


def normalize(s: str) -> str:
    return re.sub(r'\([^)]*\)|\[[^\]]*\]|-\s*\w+\s*topic', '', s.lower()).strip()


def tokenize(s: str) -> set:
    return set(re.sub(r'[^\w\s]', ' ', s).split())


def strip_feat(s: str) -> str:
    return re.sub(r'\b(feat|ft|featuring)\b.*', '', s, flags=re.IGNORECASE).strip()


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
