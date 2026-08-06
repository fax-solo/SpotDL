import { getVideoInfo } from '../youtubeClient'
import { cachedFetch } from '../requestCache'
import { getQualitySettings } from '../qualitySettings'
import { matchScore, MIN_CONFIDENCE, MIN_PREVIEW_CONFIDENCE } from './matching'
import { callFunction } from './callFunction'
import { SourceError } from './types'
import type { SourceInfo, SourceModule, SourceSearchResult } from './types'
import { youtubeSource } from './youtube'
import { deezerSource } from './deezer'
import { soundcloudSource } from './soundcloud'
import { bandcampSource } from './bandcamp'
import { invidiousSource } from './invidious'
import { jamendoSource } from './jamendo'
import { audiusSource } from './audius'
import { fmaSource } from './fma'

export interface SourceResult {
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

function stripQueryNoise(s: string): string {
  return s
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .replace(/(?<![\p{L}\p{N}])(feat|ft|featuring|remastered|remaster|expanded|deluxe|explicit|live|anniversary|version|edit|mix|hq|hd|official|video|lyric|lyrics)(?![\p{L}\p{N}])/giu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const SEARCH_QUERIES = [
  (artist: string, title: string) => artist ? `${artist} - ${title}` : title,
  (artist: string, title: string) => artist ? `${artist} ${title}` : title,
  (_artist: string, title: string) => title,
]

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// Per-source concurrency cap: parallel client downloads each fire searches at
// all 8 sources at once, so without a cap a 3-track batch can hit a single
// provider (e.g. YouTube/Deezer) with a burst that trips their rate limits.
const SOURCE_CONCURRENCY = 2

class Semaphore {
  private queue: Array<() => void> = []
  private active = 0
  private limit: number

  constructor(limit: number) {
    this.limit = limit
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>(resolve => this.queue.push(resolve))
    }
    this.active++
    try {
      return await fn()
    } finally {
      this.active--
      const next = this.queue.shift()
      if (next) next()
    }
  }
}

const sourceSemaphores = new Map<string, Semaphore>()

function getSourceSemaphore(name: string): Semaphore {
  let s = sourceSemaphores.get(name)
  if (!s) {
    s = new Semaphore(SOURCE_CONCURRENCY)
    sourceSemaphores.set(name, s)
  }
  return s
}

async function withSourceSlot<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return getSourceSemaphore(name).run(fn)
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
      searchResults = await withSourceSlot(source.name, () => source.search(q))
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
          const fetched = await withSourceSlot(source.name, () => source.info(result.url))
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

export const SOURCE_LIST: SourceModule[] = [
  youtubeSource,
  deezerSource,
  soundcloudSource,
  bandcampSource,
  invidiousSource,
  jamendoSource,
  audiusSource,
  fmaSource,
]

export async function findAudio(query: string, expectedTitle?: string, expectedArtist?: string, expectedDuration?: string | number | null, expectedIsrc?: string | null): Promise<SourceResult> {
  const qualityKey = qualityCacheSuffix()
  if (expectedTitle && expectedArtist) {
    const cached = getPreResolvedAudio(expectedTitle, expectedArtist, qualityKey)
    if (cached) return cached
  }

  const doSearch = async (): Promise<SourceResult> => {
    const queries = [...new Set(SEARCH_QUERIES.map(fn => fn(expectedArtist || '', expectedTitle || query).trim()).filter(Boolean))]

    let bestCandidate: SourceCandidate | null = null
    let bestPreviewCandidate: SourceCandidate | null = null

    const results = await Promise.allSettled(
      SOURCE_LIST.map(source =>
        trySource(source, queries, expectedTitle, expectedArtist, expectedDuration, expectedIsrc)
          .then(result => ({ source, result }))
          .catch(err => { throw err })
      )
    )

    for (const settled of results) {
      if (settled.status !== 'fulfilled' || !settled.value.result) continue
      const { result } = settled.value
      if (result.isPreview) {
        if (result.score >= MIN_PREVIEW_CONFIDENCE && (!bestPreviewCandidate || result.score > bestPreviewCandidate.score)) {
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
    return cachedFetch(`resolved:${expectedArtist}:${expectedTitle}:${qualityKey}`, doSearch, 10 * 60 * 1000)
  }

  return doSearch()
}

const _preResolveCache = new Map<string, SourceResult>()

function qualityCacheSuffix(): string {
  const q = getQualitySettings()
  return `${q.bitrate}|${q.format}|${q.variant || 'normal'}`
}

function _preResolveKey(artist: string, title: string, qualityKey?: string): string {
  return `${artist}:${title}:${qualityKey ?? qualityCacheSuffix()}`
}

function _trimPreResolveCache() {
  while (_preResolveCache.size > 500) {
    const first = _preResolveCache.keys().next().value
    if (first !== undefined) _preResolveCache.delete(first)
  }
}

export async function preResolveAudio(title: string, artist: string, knownUrl?: string): Promise<void> {
  const key = _preResolveKey(artist, title)
  if (_preResolveCache.has(key)) return
  try {
    const result = knownUrl
      ? await findAudioFromUrl(knownUrl)
      : await findAudio(`${artist} ${title}`, title, artist)
    _preResolveCache.set(key, result)
    _trimPreResolveCache()
  } catch (err) {
    console.debug('[sources] pre-resolve failed, will resolve on demand:', artist, title, err)
  }
}

export function getPreResolvedAudio(title: string, artist: string, qualityKey?: string): SourceResult | undefined {
  const key = _preResolveKey(artist, title, qualityKey)
  const result = _preResolveCache.get(key)
  if (result) {
    _preResolveCache.delete(key)
    _preResolveCache.set(key, result)
  }
  return result
}

export function stashPreResolvedAudio(title: string, artist: string, result: SourceResult) {
  const key = _preResolveKey(artist, title)
  _preResolveCache.set(key, result)
  _trimPreResolveCache()
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
    const info = await soundcloudSource.info(url)
    if (info?.audioUrl) return { info, source: 'soundcloud' }
    throw new Error('No audio found or track not downloadable on SoundCloud')
  }

  if (url.includes('bandcamp.com')) {
    const data = await callFunction('bandcamp', { action: 'info', url })
    if (data?.audioUrl) return { info: data, source: 'bandcamp' }
    throw new Error('No audio found for this Bandcamp page')
  }

  if (url.includes('deezer.com')) {
    const info = await withSourceSlot('deezer', () => deezerSource.info(url))
    if (info) return { info, source: 'deezer' }
    throw new Error('No audio found for this Deezer track')
  }

  if (url.includes('audius.co') || url.includes('audius')) {
    const idMatch = url.match(/tracks?\/([a-zA-Z0-9]+)/)
    const trackId = (idMatch ? idMatch[1] : url) || ''
    const info = await audiusSource.info(trackId)
    if (info) return { info, source: 'audius' }
    throw new Error('No audio found for this Audius track')
  }

  if (url.includes('freemusicarchive.org')) {
    const idMatch = url.match(/track[_\-/](\d+)/)
    const trackId = (idMatch ? idMatch[1] : url) || ''
    const info = await fmaSource.info(trackId)
    if (info) return { info, source: 'fma' }
    throw new Error('No audio found for this Free Music Archive track')
  }

  throw new Error('Unsupported URL. Supported: YouTube, SoundCloud, Bandcamp, Deezer, Audius, Free Music Archive')
}
