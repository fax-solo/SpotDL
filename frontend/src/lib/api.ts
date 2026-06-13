import { isAuthenticated, handleCallback } from './spotifyAuth'
import { fetchTrack, fetchAlbum, fetchPlaylist } from './spotifyApi'
import type { TrackMeta, CollectionMeta } from './spotifyApi'
import { searchYouTube, getVideoInfo } from './youtubeClient'
import { downloadAudio } from './audioProcessor'

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

export function isYouTubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url)
}

export async function handleOauthCallback(): Promise<boolean> {
  return handleCallback()
}

export async function checkAuthStatus(): Promise<boolean> {
  return isAuthenticated()
}

export async function fetchMetadata(url: string): Promise<TrackMeta | CollectionMeta> {
  const parsed = parseSpotifyUrl(url)
  if (parsed) {
    const { type, id } = parsed
    switch (type) {
      case 'track':
        return fetchTrack(id)
      case 'album':
        return fetchAlbum(id)
      case 'playlist':
        return fetchPlaylist(id)
    }
  }

  if (isYouTubeUrl(url)) {
    const info = await getVideoInfo(url)
    return {
      title: info.title,
      artist: info.author,
      album: 'Single',
      artwork_url: info.thumbnail,
      url,
      type: 'track',
    } as TrackMeta
  }

  throw new Error('Unsupported URL. Paste a Spotify or YouTube link.')
}

export async function downloadTrack(
  meta: TrackMeta,
  onProgress?: (stage: string, pct?: number) => void,
): Promise<{ blob: Blob; filename: string }> {
  onProgress?.('Searching YouTube...')

  const query = `${meta.artist} ${meta.title}`
  const searchResults = await searchYouTube(query)

  if (!searchResults.length) {
    throw new Error(`No results found on YouTube for "${meta.title}" by ${meta.artist}`)
  }

  const bestMatch = searchResults[0]
  onProgress?.('Getting audio stream...')

  const info = await getVideoInfo(bestMatch.url)

  if (!info.audioUrl) {
    throw new Error('No downloadable audio found for this track')
  }

  onProgress?.('Converting to MP3...', 0)

  const blob = await downloadAudio(
    info.audioUrl,
    {
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      artworkUrl: meta.artwork_url,
    },
    (pct) => onProgress?.('Converting to MP3...', pct),
  )

  const safe = (s: string) => s.replace(/[/\\?%*:|"<>]/g, '_')
  const filename = `${safe(meta.artist)} - ${safe(meta.title)}.mp3`

  return { blob, filename }
}
