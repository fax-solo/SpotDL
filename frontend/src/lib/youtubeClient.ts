import { Capacitor } from '@capacitor/core'
import { apiUrl } from './apiConfig'

const FUNCTIONS_BASE = () => apiUrl('/api/youtube')
const PIPED_API = 'https://pipedapi.kavin.rocks'

export interface YouTubeSearchResult {
  videoId: string
  title: string
  url: string
  author?: string
  thumbnail?: string | null
}

export interface YouTubeInfo {
  title: string
  author: string
  duration: string
  audioUrl: string | null
  thumbnail: string | null
}

function isNative() {
  return Capacitor.isNativePlatform()
}

/** On native, route an audio URL through the Cloudflare proxy to avoid CORS */
export function proxyAudioUrl(url: string): string {
  if (!isNative()) return url
  const base = apiUrl('/api/proxy')
  return `${base}?url=${encodeURIComponent(url)}`
}

async function pipedSearch(query: string): Promise<YouTubeSearchResult[] | null> {
  // Skip Piped on native — it's slow and unreliable on mobile networks
  if (isNative()) return null
  try {
    const res = await fetch(`${PIPED_API}/search?q=${encodeURIComponent(query)}&filter=videos`, {
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const items = data?.items || []
    const results = items
      .filter((item: any) => item.url?.includes('/watch?v='))
      .slice(0, 5)
      .map((item: any) => ({
        videoId: item.url.split('v=')[1]?.split('&')[0] || '',
        title: item.title || 'Unknown',
        url: item.url,
        thumbnail: item.thumbnail || null,
      }))
      .filter((r: YouTubeSearchResult) => r.videoId)
    return results.length > 0 ? results : null
  } catch {
    return null
  }
}

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://piped-api.garudalinux.org'
]

async function pipedInfo(videoId: string): Promise<YouTubeInfo | null> {
  // Try multiple Piped instances since they can be unstable
  for (const api of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${api}/streams/${videoId}`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const data = await res.json()
      const audioStreams = data?.audioStreams || []
      if (audioStreams.length > 0) {
        const best = audioStreams
          .filter((s: any) => s.url)
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0]
        if (best) {
          return {
            title: data.title || 'Unknown',
            author: data.uploader || 'Unknown',
            duration: String(data.duration || 0),
            audioUrl: proxyAudioUrl(best.url), // Proxy the stream url to bypass CORS/403
            thumbnail: data.thumbnailUrl || null,
          }
        }
      }
    } catch {
      continue
    }
  }
  return null
}

export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  // Try Piped first on web (faster), skip on native
  if (!isNative()) {
    const piped = await pipedSearch(query)
    if (piped) return piped
  }

  const res = await fetch(FUNCTIONS_BASE(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'search', query }),
  })
  if (!res.ok) throw new Error('Search failed')
  const data = await res.json()
  return data.results || []
}

export async function getVideoInfo(url: string): Promise<YouTubeInfo> {
  const videoId = extractVideoId(url)
  if (!videoId) throw new Error('Invalid YouTube URL')

  // Try Piped instances directly from the client (Web and Native)
  // This avoids Cloudflare IP blocks when getting video streams
  const piped = await pipedInfo(videoId)
  if (piped?.audioUrl) return piped

  const res = await fetch(FUNCTIONS_BASE(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'info', url }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to get video info${body ? `: ${body}` : ''}`)
  }
  const info: YouTubeInfo = await res.json()
  // Proxy the audio URL on native so CORS is bypassed
  if (info.audioUrl) {
    info.audioUrl = proxyAudioUrl(info.audioUrl)
  }
  return info
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const m = pattern.exec(url)
    if (m) return m[1]
  }
  return null
}
