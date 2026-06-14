import { isAuthenticated, handleCallback } from './spotifyAuth'
import type { TrackMeta, CollectionMeta } from './spotifyApi'
import { findAudio, findAudioFromUrl } from './sources'
import { downloadAudio } from './audioProcessor'
import { apiUrl } from './apiConfig'
import { cachedFetch } from './requestCache'

export type { TrackMeta, CollectionMeta }
export type { YouTubeSearchResult, YouTubeInfo } from './youtubeClient'

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

export async function handleOauthCallback(): Promise<boolean> {
  return handleCallback()
}

export async function checkAuthStatus(): Promise<boolean> {
  return isAuthenticated()
}

async function fetchSpotifyViaScraper(url: string): Promise<TrackMeta | CollectionMeta> {
  return cachedFetch(`spotify:${url}`, async () => {
    const res = await fetch(apiUrl('/.netlify/functions/spotify'), {
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

export async function downloadTrack(
  meta: TrackMeta,
  onProgress?: (stage: string, pct?: number) => void,
): Promise<{ blob: Blob; filename: string }> {
  const query = `${meta.artist} ${meta.title}`
  onProgress?.(`Searching...`)

  const { info, source } = await findAudio(query)

  if (!info.audioUrl) {
    throw new Error(`No downloadable audio found on ${source}`)
  }

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
  )

  const safe = (s: string) => s.replace(/[/\\?%*:|"<>]/g, '_')
  const filename = `${safe(meta.artist)} - ${safe(meta.title)}.mp3`

  return { blob, filename }
}
