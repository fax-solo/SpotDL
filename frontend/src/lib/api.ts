import { isAuthenticated } from './spotifyAuth'
import type { TrackMeta, CollectionMeta } from './spotifyApi'
import { findAudio, findAudioFromUrl } from './sources'
import { downloadAudio } from './audioProcessor'
import { apiUrl } from './apiConfig'
import { cachedFetch } from './requestCache'
import { isNativeSpotDLAvailable, nativeFetchMetadata, nativeDownloadTrack } from './nativePlugin'

export type { TrackMeta, CollectionMeta }
export type { YouTubeSearchResult, YouTubeInfo } from './youtubeClient'

let _nativeAvailable: boolean | null = null

async function nativeAvailable(): Promise<boolean> {
  if (_nativeAvailable === null) {
    _nativeAvailable = await isNativeSpotDLAvailable()
    // If plugin exists but wasn't initialized, try once more
    if (!_nativeAvailable) {
      _nativeAvailable = await isNativeSpotDLAvailable()
    }
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
]

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
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Failed to fetch Spotify metadata')
    }
    return res.json()
  })
}

export async function fetchMetadata(url: string): Promise<TrackMeta | CollectionMeta> {
  const parsed = parseSpotifyUrl(url)

  // Try native plugin first if available
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
      // Fall through to server mode
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
  try {
    const res = await fetch(apiUrl('/api/lyrics'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackName, artistName, albumName: albumName || undefined, duration: duration || undefined }),
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return { plainLyrics: null, syncedLyrics: null }
    const data = await res.json()
    return {
      plainLyrics: data.plainLyrics || null,
      syncedLyrics: data.syncedLyrics || null,
    }
  } catch {
    return { plainLyrics: null, syncedLyrics: null }
  }
}

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export async function downloadTrack(
  meta: TrackMeta,
  onProgress?: (stage: string, pct?: number) => void,
  signal?: AbortSignal,
  retries = 3,
): Promise<{ blob: Blob; filename: string; nativeFilePath?: string }> {
  const safe = (s: string) => s.replace(/[/\\?%*:|"<>]/g, '_')
  const filename = `${safe(meta.artist)} - ${safe(meta.title)}.mp3`

  // Try native plugin first (Android only)
  if (await nativeAvailable() && meta.url) {
    try {
      onProgress?.('Downloading via native SpotDL...', 0)
      const nativeResult = await nativeDownloadTrack(meta.url, (pct) => {
        onProgress?.(`Downloading... ${Math.round(pct)}%`, pct)
      })
      onProgress?.('Done', 100)
      if (nativeResult.filePath) {
        return { blob: new Blob([], { type: 'audio/mpeg' }), filename, nativeFilePath: nativeResult.filePath }
      }
      console.warn('[api] Native download returned no file path, falling back to client mode')
    } catch (err) {
      console.warn('[api] Native download failed, falling back to server mode:', err)
    }
  }

  // Try server download if backend is available
  try {
    const pingUrl = apiUrl('/api/ping')
    if (pingUrl && !pingUrl.startsWith('/')) {
      const ping = await fetch(pingUrl, { signal: AbortSignal.timeout(3000) })
      if (ping.ok) {
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
          }),
          signal,
        })
        if (res.ok) {
          const blob = await res.blob()
          if (blob.size > 0) {
            onProgress?.('Done', 100)
            return { blob, filename }
          }
        }
        // If server responds but no blob, fall through to client mode
        console.warn('[api] Server returned empty response, falling back to client mode')
      }
    }
  } catch (err) {
    console.warn('[api] Server not available, falling back to client mode:', err)
  }

  const query = `${meta.artist} ${meta.title}`
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      onProgress?.(`Retrying (${attempt}/${retries})...`)
      await delay(1000 * attempt)
    }
    try {
      onProgress?.(`Searching...`)
      signal?.throwIfAborted()

      const { info, source } = await findAudio(query, meta.title, meta.artist)

      if (!info.audioUrl) {
        throw new Error(`No downloadable audio found on ${source}`)
      }

      signal?.throwIfAborted()
      onProgress?.(`Downloading from ${source}...`, 0)

      const blob = await downloadAudio(
        info.audioUrl,
        {
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          artworkUrl: meta.artwork_url,
        },
        (pct) => onProgress?.(`Converting...`, pct),
        signal,
      )

      return { blob, filename }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < retries) {
        console.warn(`[api] Client download attempt ${attempt + 1} failed, retrying:`, lastError.message)
      }
    }
  }
  throw lastError || new Error('Download failed after retries')
}
