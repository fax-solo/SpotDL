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

function normalize(s: string): string {
  return s.toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/[^\w\s]/g, '').trim()
}

function tokenize(s: string): Set<string> {
  return new Set(s.split(/\s+/).filter(w => w.length > 1))
}

function stripNoise(s: string): string {
  return s
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(feat|ft|featuring)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function wordIntersection(a: Set<string>, b: Set<string>): number {
  let common = 0
  for (const w of a) {
    if (b.has(w)) common++
  }
  return common
}

export function matchScore(options: MatchOptions): number {
  const { expectedTitle: et, expectedArtist: ea, foundTitle: ft, foundAuthor: fa, foundDuration: fd, expectedDuration: ed, expectedIsrc, foundIsrc } = options
  const t = normalize(et)
  const a = normalize(ea)
  const ftNorm = normalize(ft)
  const faNorm = normalize(fa || '')

  if (t.length === 0) return 0

  let score = 0
  let total = 0

  // Title match (weight: 4) — token-aware
  total += 4
  if (t === ftNorm) {
    score += 4
  } else {
    const tTokens = tokenize(stripNoise(et))
    const ftTokens = tokenize(stripNoise(ft))
    if (tTokens.size > 0 && ftTokens.size > 0) {
      const common = wordIntersection(tTokens, ftTokens)
      const union = tTokens.size + ftTokens.size - common
      const jaccard = union > 0 ? common / union : 0
      if (jaccard >= 0.8) score += 4
      else if (jaccard >= 0.6) score += 3
      else if (jaccard >= 0.4) score += 2
      else if (jaccard >= 0.2) score += 1
    }
    if (t.length <= 5 && ftNorm.includes(t)) score = Math.max(score, 3)
  }

  // Artist match (weight: 3) — token-aware with multi-artist support
  if (a.length > 0) {
    total += 3
    const aTokens = tokenize(stripNoise(ea))
    const faTokens = tokenize(stripNoise(fa || ''))
    const ftTokens = tokenize(stripNoise(ft))

    let authorScore = 0
    if (faTokens.size > 0 && aTokens.size > 0) {
      const common = wordIntersection(aTokens, faTokens)
      const union = aTokens.size + faTokens.size - common
      const jaccard = union > 0 ? common / union : 0
      if (jaccard >= 0.8) authorScore = 3
      else if (jaccard >= 0.5) authorScore = 2
      else if (jaccard > 0) authorScore = 1
    }

    let titleAuthorScore = 0
    if (ftTokens.size > 0 && aTokens.size > 0) {
      const common = wordIntersection(aTokens, ftTokens)
      if (common === aTokens.size) titleAuthorScore = 2
      else if (common > 0) titleAuthorScore = 1
    }

    if (faNorm === a) authorScore = 3
    else if (faNorm.includes(a) && a.length >= 3) authorScore = Math.max(authorScore, 2.5)

    score += Math.max(authorScore, titleAuthorScore)
    if (authorScore === 0 && titleAuthorScore === 0) score -= 1
  }

  // Duration match (weight: 3) — graduated tolerance
  if (ed != null && fd != null) {
    total += 3
    const expSec = typeof ed === 'number' ? ed : parseFloat(String(ed))
    const foundSec = typeof fd === 'number' ? fd : parseFloat(String(fd))
    if (expSec > 0 && foundSec > 0) {
      const ratio = Math.min(expSec, foundSec) / Math.max(expSec, foundSec)
      if (ratio >= 0.95) score += 3
      else if (ratio >= 0.85) score += 2
      else if (ratio >= 0.7) score += 1
      else score -= 1
    }
  }

  // ISRC match (weight: 10 — definitive)
  if (expectedIsrc && foundIsrc && expectedIsrc.toUpperCase() === foundIsrc.toUpperCase()) {
    score += 10
    total += 10
  }

  return total > 0 ? score / total : 0
}
