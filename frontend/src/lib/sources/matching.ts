export interface MatchOptions {
  expectedTitle: string
  expectedArtist: string
  foundTitle: string
  foundAuthor?: string
  foundDuration?: string | number | null
  expectedDuration?: string | number | null
  expectedIsrc?: string | null
  foundIsrc?: string | null
}

export const MIN_CONFIDENCE = 0.3

const BRACKET_CONTENT = /\([^)]*\)|\[[^\]]*\]|<[^>]*>/g
const NON_WORD = /[^\w\s]/g
const MULTI_SPACE = /\s+/g
const LEADING_TRAILING = /^\s+|\s+$/g

const NOISE_WORDS = /\b(feat|ft|featuring|remastered|remaster|expanded|deluxe|explicit|live|anniversary|version|edit|mix|radio\s*edit|mono|stereo|audio|official|video|lyric|lyrics|hq|hd|4k|1080p|60fps|visualizer|official\s*audio|official\s*video|official\s*lyric|music\s*video|lyric\s*video|full\s*album|single|album\s*version|extended|short|short\s*version)\b/gi

const TOPIC_SUFFIX = /\s*-\s*Topic\s*$/i

function stripNoise(s: string): string {
  return s
    .replace(BRACKET_CONTENT, ' ')
    .replace(NON_WORD, ' ')
    .replace(NOISE_WORDS, ' ')
    .replace(MULTI_SPACE, ' ')
    .replace(LEADING_TRAILING, '')
    .toLowerCase()
}

function normalize(s: string): string {
  return s.toLowerCase().replace(BRACKET_CONTENT, '').replace(NON_WORD, '').trim()
}

function tokenize(s: string): Set<string> {
  return new Set(s.split(/\s+/).filter(w => w.length > 1))
}

function wordIntersection(a: Set<string>, b: Set<string>): number {
  let common = 0
  for (const w of a) {
    if (b.has(w)) common++
  }
  return common
}

function splitMultiArtist(s: string): string[] {
  return s.split(/\s*[,&/]\s*|\s+x\s+|\s+vs\.?\s+/i).map(p => p.trim()).filter(Boolean)
}

function tokenJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  const common = wordIntersection(a, b)
  const union = a.size + b.size - common
  return union > 0 ? common / union : 0
}

export function matchScore(options: MatchOptions): number {
  const { expectedTitle: et, expectedArtist: ea, foundTitle: ft, foundAuthor: fa, foundDuration: fd, expectedDuration: ed, expectedIsrc, foundIsrc } = options
  const t = normalize(et)
  const aParts = splitMultiArtist(normalize(ea))
  const ftNorm = normalize(ft)
  const faNorm = normalize(fa || '')

  if (t.length === 0) return 0

  let score = 0
  let total = 0

  const tTokens = tokenize(stripNoise(et))
  const ftTokens = tokenize(stripNoise(ft))
  const aTokens = new Set<string>()
  for (const part of aParts) {
    for (const tok of tokenize(part)) {
      aTokens.add(tok)
    }
  }
  const faTokens = tokenize(stripNoise(fa || ''))

  // Title match (weight: 4) — lenient
  total += 4
  if (t === ftNorm) {
    score += 4
  } else if (t.includes(ftNorm) || ftNorm.includes(t)) {
    score += 3.5
  } else if (tTokens.size > 0 && ftTokens.size > 0) {
    const jaccard = tokenJaccard(tTokens, ftTokens)
    if (jaccard >= 0.6) score += 4
    else if (jaccard >= 0.4) score += 3
    else if (jaccard >= 0.25) score += 2
    else if (jaccard >= 0.1) score += 1
    else score += 0.5
  }

  // Artist match (weight: 3) — multi-artist aware
  if (aParts.length > 0 && aParts.some(p => p.length > 0)) {
    total += 3

    let authorScore = 0

    if (faTokens.size > 0 && aTokens.size > 0) {
      const jaccard = tokenJaccard(aTokens, faTokens)
      if (jaccard >= 0.8) authorScore = 3
      else if (jaccard >= 0.5) authorScore = 2
      else if (jaccard > 0) authorScore = 1
    }

    let titleAuthorScore = 0
    if (ftTokens.size > 0 && aTokens.size > 0) {
      const common = wordIntersection(aTokens, ftTokens)
      if (common === aTokens.size && aTokens.size > 0) titleAuthorScore = 2
      else if (common > 0) titleAuthorScore = 1
    }

    if (faNorm === normalize(ea)) authorScore = 3
    else if (faNorm.includes(normalize(ea)) && normalize(ea).length >= 3) authorScore = Math.max(authorScore, 2.5)

    score += Math.max(authorScore, titleAuthorScore)
  }

  // Duration match (weight: 2) — no penalty, wider tolerance
  if (ed != null && fd != null) {
    total += 2
    const expSec = typeof ed === 'number' ? ed : parseFloat(String(ed))
    const foundSec = typeof fd === 'number' ? fd : parseFloat(String(fd))
    if (expSec > 0 && foundSec > 0) {
      const ratio = Math.min(expSec, foundSec) / Math.max(expSec, foundSec)
      if (ratio >= 0.9) score += 2
      else if (ratio >= 0.7) score += 1.5
      else if (ratio >= 0.5) score += 1
      else if (ratio >= 0.3) score += 0.5
    }
  }

  // ISRC match (weight: 10 — definitive)
  if (expectedIsrc && foundIsrc && expectedIsrc.toUpperCase() === foundIsrc.toUpperCase()) {
    score += 10
    total += 10
  }

  // Topic channel bonus (weight: 1)
  if (fa && TOPIC_SUFFIX.test(fa)) {
    score += 1
    total += 1
  }

  return total > 0 ? score / total : 0
}
