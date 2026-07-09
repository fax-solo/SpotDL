import { searchYouTube, getVideoInfo } from './youtubeClient'
import { getDeezerTrack } from './deezer'
import { apiUrl } from './apiConfig'
import { matchScore, MIN_CONFIDENCE } from './sources/matching'

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

class SourceError extends Error {
  type: string
  constructor(type: string, message: string) {
    super(message)
    this.name = 'SourceError'
    this.type = type
  }
}

async function callFunction(name: string, body: Record<string, unknown>) {
  const res = await fetch(apiUrl(`/api/${name}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (data.error_type) {
      throw new SourceError(data.error_type, data.error || `${name} error`)
    }
    return null
  }
  return data
}

async function searchSoundcloud(query: string): Promise<SourceSearchResult[]> {
  const data = await callFunction('soundcloud', { action: 'search', query })
  return data?.results || []
}

async function soundcloudInfo(url: string): Promise<SourceInfo | null> {
  const data = await callFunction('soundcloud', { action: 'info', url })
  if (data?.audioUrl) return data
  return null
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

interface SourceCandidate {
  info: SourceInfo
  source: string
  score: number
}

interface SourceModule {
  name: string
  search: (q: string) => Promise<SourceSearchResult[]>
  info: (url: string) => Promise<SourceInfo | null>
}

const SEARCH_QUERIES = [
  (artist: string, title: string) => `${artist} ${title}`,
  (_artist: string, title: string) => title,
]

async function trySource(
  source: SourceModule,
  queries: string[],
  expectedTitle?: string,
  expectedArtist?: string,
  expectedDuration?: string | number | null,
  expectedIsrc?: string | null,
): Promise<SourceCandidate | null> {
  let lastError: SourceError | null = null
  for (const q of queries) {
    let searchResults: SourceSearchResult[]
    try {
      searchResults = await source.search(q)
    } catch (err) {
      if (err instanceof SourceError) lastError = err
      continue
    }
    if (searchResults.length === 0) continue

    for (const result of searchResults) {
      let info: SourceInfo | null = null

      if (result.audioUrl) {
        info = { title: result.title, author: result.artist || '', duration: result.duration || '0', audioUrl: result.audioUrl, thumbnail: result.thumbnail || null }
      } else {
        try {
          info = await source.info(result.url)
        } catch (err) {
          if (err instanceof SourceError) lastError = err
          continue
        }
      }

      if (info && info.audioUrl) {
        const score = matchScore({
          expectedTitle: expectedTitle || q,
          expectedArtist: expectedArtist || '',
          foundTitle: info.title,
          foundAuthor: info.author,
          foundDuration: info.duration,
          expectedDuration,
          expectedIsrc,
          foundIsrc: info.isrc || result.isrc || null,
        })
        if (score >= MIN_CONFIDENCE) {
          return { info, source: source.name, score }
        }
      }
    }
  }
  if (lastError && lastError.type === 'rate_limited') throw lastError
  return null
}

export async function findAudio(query: string, expectedTitle?: string, expectedArtist?: string, expectedDuration?: string | number | null, expectedIsrc?: string | null): Promise<SourceResult> {
  const sources: SourceModule[] = [
    { name: 'youtube', search: performYouTubeSearch, info: performYouTubeInfo },
    { name: 'soundcloud', search: searchSoundcloud, info: soundcloudInfo },
    { name: 'bandcamp', search: searchBandcamp, info: bandcampInfo },
  ]

  const queries = SEARCH_QUERIES.map(fn => fn(expectedArtist || '', expectedTitle || query).trim()).filter(Boolean)
  const uniqueQueries = [...new Set(queries)]

  // Try sources sequentially — stop at first high-confidence match
  for (const source of sources) {
    const candidate = await trySource(source, uniqueQueries, expectedTitle, expectedArtist, expectedDuration, expectedIsrc)
    if (candidate && candidate.score >= 0.6) {
      return { info: candidate.info, source: candidate.source }
    }
  }

  // If no high-confidence match, return the best across all candidates
  const allCandidates: SourceCandidate[] = []
  let lastSourceError: SourceError | null = null
  for (const source of sources) {
    try {
      const candidate = await trySource(source, uniqueQueries, expectedTitle, expectedArtist, expectedDuration, expectedIsrc)
      if (candidate) allCandidates.push(candidate)
    } catch (err) {
      if (err instanceof SourceError) lastSourceError = err
    }
  }

  if (allCandidates.length > 0) {
    allCandidates.sort((a, b) => b.score - a.score)
    const best = allCandidates[0]
    return { info: best.info, source: best.source }
  }

  if (lastSourceError) throw lastSourceError
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
