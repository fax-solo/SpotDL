import { isAuthenticated } from './spotifyAuth'
import type { TrackMeta, CollectionMeta } from './spotifyApi'
import { findAudio, findAudioFromUrl } from './sources'
import { downloadAudio } from './audioProcessor'
import { apiUrl } from './apiConfig'
import { cachedFetch } from './requestCache'
import { isNativeSpotDLAvailable, nativeFetchMetadata, nativeDownloadTrack } from './nativePlugin'
import { ensureNotificationPermission } from './notifications'
import { cacheMetadata, getCachedMetadata } from './dbCache'
import { getDeezerArl, getDeezerQuality } from './deezer'
import { getQualitySettings, VARIANT_FILENAME_SUFFIXES } from './qualitySettings'

export type { TrackMeta, CollectionMeta }
export type { YouTubeSearchResult, YouTubeInfo } from './youtubeClient'

let _nativeAvailable: boolean | null = null
let _nativeChecking = false
let _nativeCheckQueue: Array<(v: boolean) => void> = []

async function nativeAvailable(): Promise<boolean> {
  if (_nativeAvailable !== null) return _nativeAvailable
  if (_nativeChecking) {
    return new Promise(r => _nativeCheckQueue.push(r))
  }
  _nativeChecking = true
  try {
    _nativeAvailable = await isNativeSpotDLAvailable()
  } finally {
    _nativeChecking = false
    _nativeCheckQueue.forEach(r => r(_nativeAvailable!))
    _nativeCheckQueue = []
  }
  return _nativeAvailable
}

const SPOTIFY_PATTERNS: Record<string, RegExp> = {
  track: /spotify\.com\/track\/([a-zA-Z0-9]+)/,
  album: /spotify\.com\/album\/([a-zA-Z0-9]+)/,
  playlist: /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
}

export function parseSpotifyUrl(url: string): { type: string; id: string } | null {
  for (const [type, pattern] of Object.entries(SPOTIFY_PATTERNS)) {
    const m = pattern.exec(url)
    if (m) return { type, id: m[1] }
  }
  return null
}

const DIRECT_URL_PATTERNS = [
  /youtube\.com|youtu\.be/i,
  /soundcloud\.com/i,
  /bandcamp\.com/i,
  /deezer\.com/i,
]

function requireOnline(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('No internet connection')
  }
}

export function isDirectUrl(url: string): boolean {
  return DIRECT_URL_PATTERNS.some(p => p.test(url))
}

export async function checkAuthStatus(): Promise<boolean> {
  return isAuthenticated()
}

async function fetchSpotifyViaScraper(url: string): Promise<TrackMeta | CollectionMeta> {
  return cachedFetch(`spotify:${url}`, async () => {
    const res = await fetch(apiUrl('/api/spotify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail || 'Failed to fetch Spotify metadata')
    }
    return res.json()
  })
}

export async function fetchMetadata(url: string): Promise<TrackMeta | CollectionMeta> {
  requireOnline()
  const parsed = parseSpotifyUrl(url)

  if (parsed && await nativeAvailable()) {
    try {
      const tracks = await nativeFetchMetadata(url)
      if (tracks.length === 1) {
        const t = tracks[0]
        return { title: t.title, artist: t.artist, album: t.album, artwork_url: t.artworkUrl, url: t.url, type: 'track' }
      }
      if (tracks.length > 1) {
        const first = tracks[0]
        const collectionType = url.includes('/album/') ? 'album' : 'playlist'
        return {
          collection_name: first.album,
          collection_artwork: first.artworkUrl,
          collection_type: collectionType,
          tracks: tracks.map(t => ({
            title: t.title,
            artist: t.artist,
            album: t.album,
            artwork_url: t.artworkUrl,
            url: t.url,
            type: 'track',
          })),
        }
      }
    } catch {
      // Fall through
    }
  }

  if (parsed) {
    return fetchSpotifyViaScraper(url)
  }

  if (isDirectUrl(url)) {
    const result = await findAudioFromUrl(url)
    return {
      title: result.info.title,
      artist: result.info.author,
      album: 'Single',
      artwork_url: result.info.thumbnail,
      url,
      type: 'track',
    } as TrackMeta
  }

  throw new Error('Unsupported URL. Paste a Spotify, YouTube, SoundCloud, or Bandcamp link.')
}

export interface LyricsResult {
  plainLyrics: string | null
  syncedLyrics: string | null
}

export async function fetchLyricsForTrack(
  trackName: string,
  artistName: string,
  albumName?: string,
  duration?: number,
): Promise<LyricsResult> {
  const cacheKey = `lyrics:${trackName}:${artistName}`
  const cached = await getCachedMetadata<LyricsResult>(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch(apiUrl('/api/lyrics'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackName, artistName, albumName: albumName || undefined, duration: duration || undefined }),
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return { plainLyrics: null, syncedLyrics: null }
    const data = await res.json()
    const result = {
      plainLyrics: data.plainLyrics || null,
      syncedLyrics: data.syncedLyrics || null,
    }
    cacheMetadata(cacheKey, result).catch(() => {})
    return result
  } catch {
    return { plainLyrics: null, syncedLyrics: null }
  }
}

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

let _serverAvailable: boolean | null = null
let _serverLastCheck = 0
const SERVER_CHECK_TTL = 60_000

async function isServerAvailable(signal?: AbortSignal): Promise<boolean> {
  const now = Date.now()
  if (_serverAvailable !== null && now - _serverLastCheck < SERVER_CHECK_TTL) {
    return _serverAvailable
  }
  try {
    const pingUrl = apiUrl('/api/ping')
    if (!pingUrl || pingUrl.startsWith('/')) return false
    const res = await fetch(pingUrl, { signal: signal || AbortSignal.timeout(2000) })
    _serverAvailable = res.ok
    _serverLastCheck = now
    return res.ok
  } catch {
    _serverAvailable = false
    _serverLastCheck = now
    return false
  }
}



const MIN_BLOB_SIZE = 10240 // 10 KB — reject anything below as invalid

function validateBlob(blob: Blob): void {
  if (blob.size < MIN_BLOB_SIZE) {
    throw new Error(`Downloaded file too small (${blob.size} bytes), likely invalid`)
  }
}

export async function downloadTrack(
  meta: TrackMeta,
  onProgress?: (stage: string, pct?: number) => void,
  signal?: AbortSignal,
  retries = 2,
): Promise<{ blob: Blob; filename: string; nativeFilePath?: string }> {
  requireOnline()
  ensureNotificationPermission()
  const safe = (s: string) => s.replace(/[/\\?%*:|"<>]/g, '_')
  const quality = getQualitySettings()
  const ext = quality.format === 'm4a' ? '.m4a' : '.mp3'
  const variantSuffix = VARIANT_FILENAME_SUFFIXES[quality.variant || 'normal']
  const filename = `${safe(meta.artist)} - ${safe(meta.title)}${variantSuffix}${ext}`

  // Try native plugin first (Android only)
  if (await nativeAvailable() && meta.url) {
    try {
      onProgress?.('Downloading via native Sinc...', 0)
      const nativeResult = await nativeDownloadTrack(meta.url, (pct) => {
        onProgress?.(`Downloading... ${Math.round(pct)}%`, pct)
      })
      onProgress?.('Done', 100)
      if (nativeResult.filePath) {
        return { blob: new Blob([], { type: 'audio/mpeg' }), filename, nativeFilePath: nativeResult.filePath }
      }
    } catch {
      // Fall through
    }
  }

  // Try Deezer download (highest quality — FLAC/320kbps via server)
  const deezerArl = getDeezerArl()
  if (deezerArl && await isServerAvailable(signal)) {
    try {
      onProgress?.('Searching Deezer...', 0)
      const dzQuality = getDeezerQuality()
      const deezerRes = await fetch(apiUrl('/api/download/deezer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          arl: deezerArl,
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          artwork_url: meta.artwork_url,
          quality: dzQuality,
          isrc: meta.isrc || undefined,
        }),
        signal,
      })
      if (deezerRes.ok) {
        const blob = await deezerRes.blob()
        validateBlob(blob)
        onProgress?.('Done', 100)
        const dzExt = dzQuality === 'FLAC' ? '.flac' : ext
        return { blob, filename: filename.replace(ext, dzExt) }
      }
      const deezerErr = await deezerRes.json().catch(() => ({ detail: deezerRes.statusText }))
      console.warn(`[api] Deezer download returned ${deezerRes.status}:`, deezerErr.detail)
    } catch (err) {
      console.warn('[api] Deezer download failed, falling back to server:', err instanceof Error ? err.message : err)
    }
  }

  // Try server download (fastest — native ffmpeg, async thread pool)
  if (await isServerAvailable(signal)) {
    try {
      onProgress?.('Downloading from server...', 0)
      const res = await fetch(apiUrl('/api/download'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          artwork_url: meta.artwork_url,
          url: meta.url,
          quality: quality.bitrate,
          format: quality.format,
        }),
        signal,
      })
      if (res.ok) {
        const blob = await res.blob()
        validateBlob(blob)
        onProgress?.('Done', 100)
        return { blob, filename }
      }
      const serverErr = await res.json().catch(() => ({ detail: res.statusText }))
      console.warn(`[api] Server download returned ${res.status}:`, serverErr.detail)
    } catch (err) {
      console.warn('[api] Server download failed, falling back to client mode:', err instanceof Error ? err.message : err)
    }
  }

  // Client-side fallback (FFmpeg WASM in browser)
  const query = `${meta.artist} ${meta.title}`
  let lastError: Error | null = null
  let lastSource = 'unknown'
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      onProgress?.(`Retrying (${attempt}/${retries})...`, 0)
      await delay(Math.min(1000 * attempt, 4000))
    }
    try {
      onProgress?.(`Searching (attempt ${attempt + 1})...`)
      signal?.throwIfAborted()

      const { info, source } = await findAudio(query, meta.title, meta.artist, meta.duration_ms, meta.isrc)
      lastSource = source

      if (!info.audioUrl) {
        throw new Error(`No downloadable audio found on ${source}`)
      }

      signal?.throwIfAborted()
      onProgress?.(`Downloading...`, 0)

      const blob = await downloadAudio(
        info.audioUrl,
        {
          title: meta.title + variantSuffix,
          artist: meta.artist,
          album: meta.album,
          artworkUrl: meta.artwork_url,
        },
        (pct) => onProgress?.(`Converting...`, pct),
        (pct) => onProgress?.(`Downloading...`, pct !== null ? Math.round(pct * 100) : undefined),
        signal,
        quality,
        meta.duration_ms,
      )

      validateBlob(blob)
      return { blob, filename }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < retries) {
        console.warn(`[api] Client download attempt ${attempt + 1} failed (source: ${lastSource}):`, lastError.message)
      }
      // Don't retry rate-limited errors — they won't resolve in seconds
      if ('type' in lastError && (lastError as any).type === 'rate_limited') break
      if ('type' in lastError && (lastError as any).type === 'scrape_blocked') break
      if ('type' in lastError && (lastError as any).type === 'source_unavailable') break
    }
  }
  throw lastError || new Error(`Download failed after retries. Last source: ${lastSource}. Try a different search query or a direct URL.`)
}
