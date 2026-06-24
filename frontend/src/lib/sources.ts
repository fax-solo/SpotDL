import { searchYouTube, getVideoInfo } from './youtubeClient'
import { getDeezerTrack } from './deezer'
import { apiUrl } from './apiConfig'

interface MatchOptions {
  expectedTitle: string
  expectedArtist: string
  foundTitle: string
  foundAuthor?: string
  foundDuration?: string | number | null
  expectedDuration?: string | number | null
  expectedIsrc?: string | null
  foundIsrc?: string | null
}

const MIN_CONFIDENCE = 0.3

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

function matchScore(options: MatchOptions): number {
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
    // Substring fallback for short titles
    if (t.length <= 5 && ftNorm.includes(t)) score = Math.max(score, 3)
  }

  // Artist match (weight: 3) — token-aware with multi-artist support
  if (a.length > 0) {
    total += 3
    const aTokens = tokenize(stripNoise(ea))
    const faTokens = tokenize(stripNoise(fa || ''))
    const ftTokens = tokenize(stripNoise(ft))

    // Check artist in found author
    let authorScore = 0
    if (faTokens.size > 0 && aTokens.size > 0) {
      const common = wordIntersection(aTokens, faTokens)
      const union = aTokens.size + faTokens.size - common
      const jaccard = union > 0 ? common / union : 0
      if (jaccard >= 0.8) authorScore = 3
      else if (jaccard >= 0.5) authorScore = 2
      else if (jaccard > 0) authorScore = 1
    }

    // Check artist in found title (e.g., "Artist - Title")
    let titleAuthorScore = 0
    if (ftTokens.size > 0 && aTokens.size > 0) {
      const common = wordIntersection(aTokens, ftTokens)
      if (common === aTokens.size) titleAuthorScore = 2
      else if (common > 0) titleAuthorScore = 1
    }

    // Artist as substring
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

interface SourceSearchResult {
  url: string
  title: string
  artist?: string
  duration?: string
  audioUrl?: string | null
  thumbnail?: string | null
  source: string
  isrc?: string | null
}

interface SourceInfo {
  title: string
  author: string
  duration: string
  audioUrl: string | null
  thumbnail: string | null
  isrc?: string | null
}

async function callFunction(name: string, body: Record<string, unknown>) {
  const res = await fetch(apiUrl(`/api/${name}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
  return res.json()
}

async function searchSoundcloud(query: string): Promise<SourceSearchResult[]> {
  const data = await callFunction('soundcloud', { action: 'search', query })
  return data?.results || []
}

async function soundcloudInfo(url: string): Promise<SourceInfo | null> {
  const data = await callFunction('soundcloud', { action: 'info', url })
  return data
}

async function searchBandcamp(query: string): Promise<SourceSearchResult[]> {
  const data = await callFunction('bandcamp', { action: 'search', query })
  return data?.results || []
}

async function bandcampInfo(url: string): Promise<SourceInfo | null> {
  const data = await callFunction('bandcamp', { action: 'info', url })
  if (data?.audioUrl) return data
  return null
}

async function deezerInfo(url: string): Promise<SourceInfo | null> {
  const match = url.match(/deezer\.com\/track\/(\d+)/)
  if (!match) return null
  const track = await getDeezerTrack(parseInt(match[1]))
  if (!track) return null
  return {
    title: track.title,
    author: track.artist,
    duration: track.duration,
    audioUrl: null,
    thumbnail: track.thumbnail,
    isrc: track.isrc,
  }
}

interface SourceResult {
  info: SourceInfo
  source: string
}

const SEARCH_QUERIES = [
  (artist: string, title: string) => `${artist} ${title}`,
  (_artist: string, title: string) => title,
]

export async function findAudio(query: string, expectedTitle?: string, expectedArtist?: string, expectedDuration?: string | number | null, expectedIsrc?: string | null): Promise<SourceResult> {
  const sources: { name: string; search: (q: string) => Promise<SourceSearchResult[]>; info: (url: string) => Promise<SourceInfo | null> }[] = [
    { name: 'youtube', search: performYouTubeSearch, info: performYouTubeInfo },
    { name: 'soundcloud', search: searchSoundcloud, info: soundcloudInfo },
    { name: 'bandcamp', search: searchBandcamp, info: bandcampInfo },
  ]

  const candidates: { info: SourceInfo; source: string; score: number }[] = []
  const queries = SEARCH_QUERIES.map(fn => fn(expectedArtist || '', expectedTitle || query).trim()).filter(Boolean)
  const uniqueQueries = [...new Set(queries)]

  await Promise.allSettled(
    sources.map(async (source) => {
      for (const q of uniqueQueries) {
        const searchResults = await source.search(q)
        if (searchResults.length === 0) continue

        for (const result of searchResults) {
          let info: SourceInfo | null = null

          if (result.audioUrl) {
            info = { title: result.title, author: result.artist || '', duration: result.duration || '0', audioUrl: result.audioUrl, thumbnail: result.thumbnail || null }
          } else {
            info = await source.info(result.url)
          }

          if (info && info.audioUrl) {
            const score = matchScore({
              expectedTitle: expectedTitle || query,
              expectedArtist: expectedArtist || '',
              foundTitle: info.title,
              foundAuthor: info.author,
              foundDuration: info.duration,
              expectedDuration,
              expectedIsrc,
              foundIsrc: info.isrc || result.isrc || null,
            })
            if (score >= MIN_CONFIDENCE) {
              candidates.push({ info, source: source.name, score })
            }
          }
        }
        // If we found good candidates on this query, skip remaining queries for this source
        if (candidates.some(c => c.source === source.name && c.score >= 0.6)) break
      }
    }),
  )

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score)
    const best = candidates[0]
    return { info: best.info, source: best.source }
  }

  throw new Error('No audio found on any source. Try a direct YouTube or SoundCloud URL.')
}

export async function findAudioFromUrl(url: string): Promise<SourceResult> {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const info = await getVideoInfo(url)
    if (info.audioUrl) return { info, source: 'youtube' }
    throw new Error('No audio found for this YouTube video')
  }

  if (url.includes('soundcloud.com')) {
    const info = await soundcloudInfo(url)
    if (info?.audioUrl) return { info, source: 'soundcloud' }
    throw new Error('No audio found or track not downloadable on SoundCloud')
  }

  if (url.includes('bandcamp.com')) {
    const info = await bandcampInfo(url)
    if (info?.audioUrl) return { info, source: 'bandcamp' }
    throw new Error('No audio found for this Bandcamp page')
  }

  if (url.includes('deezer.com')) {
    const info = await deezerInfo(url)
    if (info) return { info, source: 'deezer' }
    throw new Error('No audio found for this Deezer track')
  }

  throw new Error('Unsupported URL')
}

async function performYouTubeSearch(query: string): Promise<SourceSearchResult[]> {
  const results = await searchYouTube(query)
  return results.map(r => ({ ...r, source: 'youtube' }))
}

async function performYouTubeInfo(url: string): Promise<SourceInfo | null> {
  try {
    const info = await getVideoInfo(url)
    return info
  } catch {
    return null
  }
}
