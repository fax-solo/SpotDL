import { searchYouTube, getVideoInfo } from './youtubeClient'
import { searchDeezer, getDeezerTrack, searchDeezerByIsrc } from './deezer'
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

function titleMatches(options: MatchOptions): boolean {
  return matchScore(options) >= MIN_CONFIDENCE
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

  // Title match (weight: 4)
  total += 4
  if (t === ftNorm) score += 4
  else if (ftNorm.includes(t) && t.length >= 3) score += 3
  else if (t.includes(ftNorm) && ftNorm.length >= 3) score += 2
  else if (ftNorm.includes(t)) score += 2

  // Artist match (weight: 3)
  if (a.length > 0) {
    total += 3
    const inTitle = ftNorm.includes(a)
    const inAuthor = faNorm.length > 0 && (faNorm.includes(a) || a.includes(faNorm) || faNorm === a)
    if (a === ftNorm || a === faNorm || faNorm === a) score += 3
    else if (a === ftNorm) score += 3
    else if (inTitle || inAuthor) score += 2
    else score -= 1
  }

  // Duration match (weight: 3)
  if (ed != null && fd != null) {
    total += 3
    const expSec = typeof ed === 'number' ? ed : parseFloat(String(ed))
    const foundSec = typeof fd === 'number' ? fd : parseFloat(String(fd))
    if (expSec > 0 && foundSec > 0) {
      const ratio = Math.min(expSec, foundSec) / Math.max(expSec, foundSec)
      if (ratio >= 0.9) score += 3
      else if (ratio >= 0.8) score += 1.5
      else if (ratio >= 0.7) score += 0.5
      else score -= 2
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

async function searchDeezerSource(query: string): Promise<SourceSearchResult[]> {
  const results = await searchDeezer(query)
  return results.map(r => ({
    url: `https://www.deezer.com/track/${r.id}`,
    title: r.title,
    artist: r.artist,
    duration: r.duration,
    audioUrl: r.preview || null,
    thumbnail: r.thumbnail,
    source: 'deezer',
    isrc: r.isrc,
  }))
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

export async function findAudio(query: string, expectedTitle?: string, expectedArtist?: string, expectedDuration?: string | number | null, expectedIsrc?: string | null): Promise<SourceResult> {
  const sources: { name: string; search: (q: string) => Promise<SourceSearchResult[]>; info: (url: string) => Promise<SourceInfo | null> }[] = [
    { name: 'deezer', search: searchDeezerSource, info: deezerInfo },
    { name: 'youtube', search: performYouTubeSearch, info: performYouTubeInfo },
    { name: 'soundcloud', search: searchSoundcloud, info: soundcloudInfo },
    { name: 'bandcamp', search: searchBandcamp, info: bandcampInfo },
  ]

  // Try ISRC-based Deezer lookup first (definitive match)
  if (expectedIsrc) {
    try {
      const deezerTrack = await searchDeezerByIsrc(expectedIsrc)
      if (deezerTrack?.preview) {
        return {
          info: {
            title: deezerTrack.title,
            author: deezerTrack.artist,
            duration: deezerTrack.duration,
            audioUrl: deezerTrack.preview,
            thumbnail: deezerTrack.thumbnail,
            isrc: deezerTrack.isrc,
          },
          source: 'deezer',
        }
      }
      // If no preview URL, fall through to normal search (don't block with a useless result)
    } catch {
      // Fall through
    }
  }

  const candidates: { info: SourceInfo; source: string; score: number }[] = []

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const searchResults = await source.search(query)
      if (searchResults.length === 0) return

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
    }),
  )

  // Pick best match by score
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score)
    const best = candidates[0]
    return { info: best.info, source: best.source }
  }

  throw new Error('No audio found on any source. Try a direct YouTube or SoundCloud URL.')
}

export async function findAudioFromUrl(url: string): Promise<SourceResult> {
  // Direct YouTube URL
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const info = await getVideoInfo(url)
    if (info.audioUrl) return { info, source: 'youtube' }
    throw new Error('No audio found for this YouTube video')
  }

  // Direct SoundCloud URL
  if (url.includes('soundcloud.com')) {
    const info = await soundcloudInfo(url)
    if (info?.audioUrl) return { info, source: 'soundcloud' }
    throw new Error('No audio found or track not downloadable on SoundCloud')
  }

  // Direct Bandcamp URL
  if (url.includes('bandcamp.com')) {
    const info = await bandcampInfo(url)
    if (info?.audioUrl) return { info, source: 'bandcamp' }
    throw new Error('No audio found for this Bandcamp page')
  }

  // Direct Deezer URL
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
