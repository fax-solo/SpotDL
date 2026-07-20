import { isAuthenticated } from './spotifyAuth'
import type { TrackMeta, CollectionMeta } from './spotifyApi'
import { findAudio, findAudioFromUrl, stashPreResolvedAudio } from './sources'
import { downloadAudio } from './audioProcessor'
import { apiUrl } from './apiConfig'
import { cachedFetch } from './requestCache'
import { isNativeSpotDLAvailable, nativeFetchMetadata, nativeDownloadTrack } from './nativePlugin'
import { ensureNotificationPermission } from './notifications'
import { cacheMetadata, getCachedMetadata } from './dbCache'
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
    if (m) return { type, id: m[1]! }
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
        const t = tracks[0]!
        return { title: t.title, artist: t.artist, album: t.album, artwork_url: t.artworkUrl!, url: t.url!, type: 'track' }
      }
      if (tracks.length > 1) {
        const first = tracks[0]!
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

function validateBlob(blob: Blob, durationMs?: number): void {
  if (blob.size < MIN_BLOB_SIZE) {
    throw new Error(`Downloaded file too small (${blob.size} bytes), likely invalid`)
  }
  if (durationMs && durationMs > 0) {
    const estMinBytes = (durationMs / 1000) * 128 * 1000 / 8 * 0.3 // 30% of expected size at 128kbps
    if (blob.size < estMinBytes) {
      throw new Error(`Downloaded file too short for expected duration (${blob.size} bytes, expected ≥${Math.round(estMinBytes)}), likely a preview clip`)
    }
  }
}

export async function downloadTrack(
  meta: TrackMeta,
  onProgress?: (stage: string, pct?: number) => void,
  signal?: AbortSignal,
  retries = 2,
  lyrics?: string | null,
): Promise<{ blob: Blob; filename: string; nativeFilePath?: string; artworkEmbedded: boolean }> {
  requireOnline()
  ensureNotificationPermission()
  const safe = (s: string) => s.replace(/[/\\?%*:|"<>]/g, '_')
  const quality = getQualitySettings()
  const ext = quality.format === 'm4a' ? '.m4a' : '.mp3'
  const variantSuffix = VARIANT_FILENAME_SUFFIXES[quality.variant || 'normal']
  let filename = `${safe(meta.artist)} - ${safe(meta.title)}${variantSuffix}${ext}`

  // Try native plugin first (Android only)
  if (await nativeAvailable() && meta.url) {
    try {
      onProgress?.('Downloading via native Sinc...', 0)
      const nativeResult = await nativeDownloadTrack(meta.url, (pct) => {
        onProgress?.(`Downloading... ${Math.round(pct)}%`, pct)
      })
      onProgress?.('Done', 100)
      if (nativeResult.filePath) {
        return { blob: new Blob([], { type: 'audio/mpeg' }), filename, nativeFilePath: nativeResult.filePath, artworkEmbedded: true }
      }
    } catch {
      // Fall through
    }
  }

  // Try server download (fastest path)
  const serverAvailable = isServerAvailable(signal)

  if (await serverAvailable) {
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
        ...(signal ? { signal } : {}),
      })
      if (res.ok) {
        const blob = await res.blob()
        validateBlob(blob, meta.duration_ms)
        onProgress?.('Done', 100)
        return { blob, filename, artworkEmbedded: true }
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

      const result = await findAudio(query, meta.title, meta.artist, meta.duration_ms, meta.isrc)
      const { info, source } = result
      lastSource = source
      if (meta.title && meta.artist) {
        stashPreResolvedAudio(meta.title, meta.artist, result)
      }

      if (!info.audioUrl) {
        throw new Error(`No downloadable audio found on ${source}`)
      }

      if (result.isPreview) {
        filename = `${safe(meta.artist)} - ${safe(meta.title)}${variantSuffix} (Preview)${ext}`
        onProgress?.('Only a 30-second preview is available for this track', 0)
      }

      signal?.throwIfAborted()
      onProgress?.(`Downloading...`, 0)

      const dlMeta: {
        title: string; artist: string; album: string; artworkUrl: string | null; lyrics?: string | null
      } = {
        title: meta.title + variantSuffix,
        artist: meta.artist,
        album: meta.album,
        artworkUrl: meta.artwork_url || info.thumbnail || null,
      }
      if (lyrics) dlMeta.lyrics = lyrics
      const { blob, artworkEmbedded } = await downloadAudio(
        info.audioUrl,
        dlMeta,
        (pct) => onProgress?.(`Converting...`, pct),
        (pct) => onProgress?.(`Downloading...`, pct !== null ? Math.round(pct * 100) : undefined),
        signal,
        quality,
        meta.duration_ms,
      )

      validateBlob(blob)
      return { blob, filename, artworkEmbedded }
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
