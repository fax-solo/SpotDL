import { searchYouTube, getVideoInfo } from './youtubeClient'
import { getDeezerTrack, searchDeezer } from './deezer'
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
    id = parseInt(match[1]!)
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

// ── Audius source ──
async function searchAudius(query: string): Promise<SourceSearchResult[]> {
  const data = await callFunction('audius', { action: 'search', query })
  return (data?.results || []).map((r: any) => ({
    url: r.id,
    title: r.title,
    artist: r.artist,
    duration: r.duration,
    audioUrl: r.audioUrl || null,
    thumbnail: r.thumbnail,
    source: 'audius',
  }))
}

async function audiusInfo(trackId: string): Promise<SourceInfo | null> {
  const data = await callFunction('audius', { action: 'info', id: trackId })
  if (data?.audioUrl) return data
  return null
}

// ── Invidious source ──
async function searchInvidious(query: string): Promise<SourceSearchResult[]> {
  const data = await callFunction('invidious', { action: 'search', query })
  return (data?.results || []).map((r: any) => ({
    url: r.url || `https://youtube.com/watch?v=${r.videoId}`,
    title: r.title,
    artist: r.author,
    duration: r.duration,
    audioUrl: null,
    thumbnail: r.thumbnail,
    source: 'invidious',
  }))
}

async function invidiousInfo(url: string): Promise<SourceInfo | null> {
  const data = await callFunction('invidious', { action: 'info', url })
  if (data?.audioUrl) return data
  return null
}

// ── FMA source (Free Music Archive) ──
async function searchFma(query: string): Promise<SourceSearchResult[]> {
  const data = await callFunction('fma', { action: 'search', query })
  return (data?.results || []).map((r: any) => ({
    url: r.id,
    title: r.title,
    artist: r.artist,
    duration: r.duration || '',
    audioUrl: r.audioUrl || null,
    thumbnail: r.thumbnail || null,
    source: 'fma',
  }))
}

async function fmaInfo(trackId: string): Promise<SourceInfo | null> {
  const data = await callFunction('fma', { action: 'info', id: trackId })
  if (data?.audioUrl) return data
  return null
}

// ── Piped direct stream (uses existing YouTube search + Piped stream URLs) ──
async function searchPiped(query: string): Promise<SourceSearchResult[]> {
  const results = await searchYouTube(query)
  return results.map(r => ({ ...r, source: 'piped' as const }))
}

async function pipedInfo(url: string): Promise<SourceInfo | null> {
  try {
    const info = await getVideoInfo(url)
    return info
  } catch {
    return null
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
  (artist: string, title: string) => artist ? `${artist} - ${title}` : title,
  (artist: string, title: string) => artist ? `${artist} ${title}` : title,
  (_artist: string, title: string) => title,
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
        info = { title: result.title, author: result.artist || '', duration: result.duration || '0', audioUrl: result.audioUrl, thumbnail: result.thumbnail || null, ...(result.isPreview !== undefined ? { isPreview: result.isPreview } : {}) }
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
        ...(expectedDuration !== undefined ? { expectedDuration } : {}),
        ...(expectedIsrc !== undefined ? { expectedIsrc } : {}),
        foundIsrc: info.isrc || result.isrc || null,
      })
      if (score >= MIN_CONFIDENCE) {
        return { info, source: source.name, score, ...(info.isPreview !== undefined ? { isPreview: info.isPreview } : {}) }
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
        ...(expectedDuration !== undefined ? { expectedDuration } : {}),
        ...(expectedIsrc !== undefined ? { expectedIsrc } : {}),
        foundIsrc: info.isrc || result.isrc || null,
      })
      if (score >= MIN_CONFIDENCE) {
        return { info, source: source.name, score, ...(info.isPreview !== undefined ? { isPreview: info.isPreview } : {}) }
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

async function searchJamendo(query: string): Promise<SourceSearchResult[]> {
  const data = await callFunction('jamendo', { action: 'search', query })
  return data?.results || []
}

async function jamendoInfo(trackId: string): Promise<SourceInfo | null> {
  const data = await callFunction('jamendo', { action: 'info', url: trackId })
  if (data?.audioUrl) return data
  return null
}

export async function findAudio(query: string, expectedTitle?: string, expectedArtist?: string, expectedDuration?: string | number | null, expectedIsrc?: string | null): Promise<SourceResult> {
  if (expectedTitle && expectedArtist) {
    const cached = getPreResolvedAudio(expectedTitle, expectedArtist)
    if (cached) return cached
  }

  const doSearch = async (): Promise<SourceResult> => {
    const queries = [...new Set(SEARCH_QUERIES.map(fn => fn(expectedArtist || '', expectedTitle || query).trim()).filter(Boolean))]

    const sources: SourceModule[] = [
      { name: 'piped', search: searchPiped, info: pipedInfo },
      { name: 'youtube', search: performYouTubeSearch, info: performYouTubeInfo },
      { name: 'deezer', search: searchDeezerSource, info: deezerSourceInfo },
      { name: 'soundcloud', search: searchSoundcloud, info: soundcloudInfo },
      { name: 'invidious', search: searchInvidious, info: invidiousInfo },
      { name: 'jamendo', search: searchJamendo, info: jamendoInfo },
      { name: 'audius', search: searchAudius, info: audiusInfo },
      { name: 'fma', search: searchFma, info: fmaInfo },
    ]

    let bestCandidate: SourceCandidate | null = null
    let bestPreviewCandidate: SourceCandidate | null = null

    const results = await Promise.allSettled(
      sources.map(source =>
        trySource(source, queries, expectedTitle, expectedArtist, expectedDuration, expectedIsrc)
          .then(result => ({ source, result }))
          .catch(err => { throw err })
      )
    )

    for (const settled of results) {
      if (settled.status !== 'fulfilled' || !settled.value.result) continue
      const { result } = settled.value
      if (result.isPreview) {
        if (!bestPreviewCandidate || result.score > bestPreviewCandidate.score) {
          bestPreviewCandidate = result
        }
        continue
      }
      if (result.score >= 0.6) {
        return { info: result.info, source: result.source }
      }
      if (!bestCandidate || result.score > bestCandidate.score) {
        bestCandidate = result
      }
    }

    const chosen = bestCandidate || bestPreviewCandidate
    if (chosen) {
      return {
        info: chosen.info,
        source: chosen.source,
        ...(chosen.isPreview ? { isPreview: true } : {}),
      }
    }
    const lastError = results.find(r => r.status === 'rejected')?.reason
    if (lastError instanceof Error) throw lastError
    throw new Error('No audio found on any source. Try a direct YouTube or SoundCloud URL.')
  }

  if (expectedArtist && expectedTitle) {
    return cachedFetch(`resolved:${expectedArtist}:${expectedTitle}`, doSearch, 10 * 60 * 1000)
  }

  return doSearch()
}

let _preResolveCache = new Map<string, SourceResult>()

export async function preResolveAudio(title: string, artist: string, knownUrl?: string): Promise<void> {
  const key = `${artist}:${title}`
  if (_preResolveCache.has(key)) return
  try {
    const result = knownUrl
      ? await findAudioFromUrl(knownUrl)
      : await findAudio(`${artist} ${title}`, title, artist)
    _preResolveCache.set(key, result)
    if (_preResolveCache.size > 500) _preResolveCache.clear()
  } catch {}
}

export function getPreResolvedAudio(title: string, artist: string): SourceResult | undefined {
  return _preResolveCache.get(`${artist}:${title}`)
}

export function stashPreResolvedAudio(title: string, artist: string, result: SourceResult) {
  const key = `${artist}:${title}`
  _preResolveCache.set(key, result)
  if (_preResolveCache.size > 500) _preResolveCache.clear()
}

export function clearPreResolvedAudio() {
  _preResolveCache.clear()
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
    const data = await callFunction('bandcamp', { action: 'info', url })
    if (data?.audioUrl) return { info: data, source: 'bandcamp' }
    throw new Error('No audio found for this Bandcamp page')
  }

  if (url.includes('deezer.com')) {
    const info = await deezerSourceInfo(url)
    if (info) return { info, source: 'deezer' }
    throw new Error('No audio found for this Deezer track')
  }

  if (url.includes('audius.co') || url.includes('audius')) {
    const idMatch = url.match(/tracks?\/([a-zA-Z0-9]+)/)
    const trackId = (idMatch ? idMatch[1] : url) || ''
    const info = await audiusInfo(trackId)
    if (info) return { info, source: 'audius' }
    throw new Error('No audio found for this Audius track')
  }

  if (url.includes('freemusicarchive.org')) {
    const idMatch = url.match(/track[_\-/](\d+)/)
    const trackId = (idMatch ? idMatch[1] : url) || ''
    const info = await fmaInfo(trackId)
    if (info) return { info, source: 'fma' }
    throw new Error('No audio found for this Free Music Archive track')
  }

  throw new Error('Unsupported URL. Supported: YouTube, SoundCloud, Bandcamp, Deezer, Audius, Free Music Archive')
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
