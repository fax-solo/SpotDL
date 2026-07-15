import { searchYouTube, getVideoInfo } from './youtubeClient'
import { getDeezerTrack, searchDeezer } from './deezer'
import { searchJamendo, jamendoInfo } from './jamendo'
import { apiUrl } from './apiConfig'
import { matchScore, MIN_CONFIDENCE } from './sources/matching'
import { cachedFetch } from './requestCache'

interface SourceSearchResult {
  url: string
  title: string
  artist?: string
  duration?: string
  audioUrl?: string | null
  thumbnail?: string | null
  source: string
  isrc?: string | null
  isPreview?: boolean
}

interface SourceInfo {
  title: string
  author: string
  duration: string
  audioUrl: string | null
  thumbnail: string | null
  isrc?: string | null
  isPreview?: boolean
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

async function searchJamendoSource(query: string): Promise<SourceSearchResult[]> {
  const results = await searchJamendo(query)
  return results.map(r => ({ ...r, source: 'jamendo' }))
}

async function jamendoSourceInfo(url: string): Promise<SourceInfo | null> {
  const data = await jamendoInfo(url)
  if (data?.audioUrl) return data
  return null
}

async function searchDeezerSource(query: string): Promise<SourceSearchResult[]> {
  const results = await searchDeezer(query)
  return results.map(r => ({
    url: String(r.id),
    title: r.title,
    artist: r.artist,
    duration: r.duration,
    audioUrl: r.audioUrl || r.preview || null,
    thumbnail: r.thumbnail,
    source: 'deezer',
    isPreview: r.isPreview,
  }))
}

async function deezerSourceInfo(url: string): Promise<SourceInfo | null> {
  const match = url.match(/deezer\.com\/track\/(\d+)/)
  let id: number | null = null
  if (match) {
    id = parseInt(match[1])
  } else {
    id = parseInt(url)
    if (isNaN(id)) return null
  }
  const track = await getDeezerTrack(id)
  if (!track) return null
  return {
    title: track.title,
    author: track.artist,
    duration: track.duration,
    audioUrl: track.audioUrl || track.preview || null,
    thumbnail: track.thumbnail,
    isrc: track.isrc,
    isPreview: track.isPreview,
  }
}

interface SourceResult {
  info: SourceInfo
  source: string
  isPreview?: boolean
}

interface SourceCandidate {
  info: SourceInfo
  source: string
  score: number
  isPreview?: boolean
}

interface SourceModule {
  name: string
  search: (q: string) => Promise<SourceSearchResult[]>
  info: (url: string) => Promise<SourceInfo | null>
}

function stripQueryNoise(s: string): string {
  return s.replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/\b(feat|ft|featuring|remastered|remaster|expanded|deluxe|explicit|live|anniversary|version|edit|mix|hq|hd|official|video|lyric|lyrics)\b/gi, '').replace(/\s+/g, ' ').trim()
}

const SEARCH_QUERIES = [
  (artist: string, title: string) => artist ? `${artist} ${title}` : title,
  (artist: string, title: string) => artist ? `${artist} - ${title}` : title,
  (artist: string, title: string) => artist ? `${artist} - ${title} Topic` : title,
  (_artist: string, title: string) => title,
  (artist: string, title: string) => artist ? `${title} ${artist}` : title,
]

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

function hasMinimumTokens(s: string): boolean {
  return s.split(/\s+/).filter(w => w.length > 1).length >= 1
}

async function trySource(
  source: SourceModule,
  queries: string[],
  expectedTitle?: string,
  expectedArtist?: string,
  expectedDuration?: string | number | null,
  expectedIsrc?: string | null,
  attempt = 0,
): Promise<SourceCandidate | null> {
  let lastError: SourceError | null = null
  const maxAttempts = 2

  for (const q of queries) {
    if (!hasMinimumTokens(q)) continue
    let searchResults: SourceSearchResult[]
    try {
      searchResults = await source.search(q)
    } catch (err) {
      if (err instanceof SourceError) lastError = err
      continue
    }
    if (searchResults.length === 0) continue

    const resolveInfo = async (result: SourceSearchResult): Promise<{ info: SourceInfo; result: SourceSearchResult } | null> => {
      let info: SourceInfo | null = null
      if (result.audioUrl) {
        info = { title: result.title, author: result.artist || '', duration: result.duration || '0', audioUrl: result.audioUrl, thumbnail: result.thumbnail || null, isPreview: result.isPreview }
      } else {
        try {
          const fetched = await source.info(result.url)
          if (fetched?.audioUrl) info = fetched
        } catch (err) {
          if (err instanceof SourceError) lastError = err
        }
      }
      if (!info?.audioUrl) return null
      return { info, result }
    }

    const topCandidates = searchResults.slice(0, 3).map(resolveInfo)
    const settled = await Promise.allSettled(topCandidates)
    for (const s of settled) {
      if (s.status !== 'fulfilled' || !s.value) continue
      const { info, result } = s.value
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
        return { info, source: source.name, score, isPreview: info.isPreview }
      }
    }

    for (const result of searchResults.slice(3)) {
      const resolved = await resolveInfo(result)
      if (!resolved) continue
      const { info } = resolved
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
        return { info, source: source.name, score, isPreview: info.isPreview }
      }
    }
  }

  if (lastError && lastError.type === 'rate_limited') throw lastError

  if (attempt < maxAttempts - 1) {
    await delay(500 * (attempt + 1))
    const strippedQueries = queries
      .map(q => stripQueryNoise(q))
      .filter(q => q.length > 2)
    const unique = [...new Set(strippedQueries)]
    return trySource(source, unique, expectedTitle, expectedArtist, expectedDuration, expectedIsrc, attempt + 1)
  }

  return null
}

export async function findAudio(query: string, expectedTitle?: string, expectedArtist?: string, expectedDuration?: string | number | null, expectedIsrc?: string | null): Promise<SourceResult> {
  const doSearch = async (): Promise<SourceResult> => {
    const sources: SourceModule[] = [
      { name: 'youtube', search: performYouTubeSearch, info: performYouTubeInfo },
      { name: 'soundcloud', search: searchSoundcloud, info: soundcloudInfo },
      { name: 'bandcamp', search: searchBandcamp, info: bandcampInfo },
      { name: 'jamendo', search: searchJamendoSource, info: jamendoSourceInfo },
      { name: 'deezer', search: searchDeezerSource, info: deezerSourceInfo },
    ]

    const queries = [...new Set(SEARCH_QUERIES.map(fn => fn(expectedArtist || '', expectedTitle || query).trim()).filter(Boolean))]

    const results = await Promise.allSettled(
      sources.map(source =>
        trySource(source, queries, expectedTitle, expectedArtist, expectedDuration, expectedIsrc)
          .then(candidate => ({ source: source.name, candidate }))
      )
    )

    const allCandidates: SourceCandidate[] = []
    let lastSourceError: SourceError | null = null

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.candidate) {
        if (r.value.candidate.score >= 0.6) {
          return { info: r.value.candidate.info, source: r.value.candidate.source, isPreview: r.value.candidate.isPreview }
        }
        allCandidates.push(r.value.candidate)
      } else if (r.status === 'rejected' && r.reason instanceof SourceError) {
        lastSourceError = r.reason
      }
    }

    if (allCandidates.length > 0) {
      allCandidates.sort((a, b) => b.score - a.score)
      const best = allCandidates[0]
      return { info: best.info, source: best.source, isPreview: best.isPreview }
    }

    if (lastSourceError) throw lastSourceError
    throw new Error('No audio found on any source. Try a direct YouTube or SoundCloud URL.')
  }

  if (expectedArtist && expectedTitle) {
    return cachedFetch(`resolved:${expectedArtist}:${expectedTitle}`, doSearch, 4 * 60 * 60 * 1000)
  }

  return doSearch()
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
    const info = await deezerSourceInfo(url)
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
