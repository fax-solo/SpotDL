import { Capacitor } from '@capacitor/core'
import { apiUrl } from './apiConfig'

const FUNCTIONS_BASE = () => apiUrl('/api/youtube')

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

/** Route an audio URL through the Cloudflare proxy to avoid browser CORS restrictions */
export function proxyAudioUrl(url: string): string {
  const base = apiUrl('/api/proxy')
  return `${base}?url=${encodeURIComponent(url)}`
}

function abortTimeout(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

async function pipedSearch(query: string): Promise<YouTubeSearchResult[] | null> {
  // Skip Piped on native — it's slow and unreliable on mobile networks
  if (isNative()) return null

  async function tryInstance(api: string): Promise<YouTubeSearchResult[] | null> {
    const res = await fetch(`${api}/search?q=${encodeURIComponent(query)}&filter=videos`, {
      signal: abortTimeout(3000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const items = data?.items || []
    const results = items
      .filter((item: any) => item.url?.includes('/watch?v='))
      .slice(0, 3)
      .map((item: any) => ({
        videoId: item.url.split('v=')[1]?.split('&')[0] || '',
        title: item.title || 'Unknown',
        url: item.url,
        thumbnail: item.thumbnail || null,
      }))
      .filter((r: YouTubeSearchResult) => r.videoId)
    return results.length > 0 ? results : null
  }

  const settled = await Promise.allSettled(PIPED_INSTANCES.map(tryInstance))
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) return r.value
  }
  return null
}

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://piped-api.garudalinux.org'
]

async function pipedInfo(videoId: string): Promise<YouTubeInfo | null> {
  const results = await Promise.allSettled(
    PIPED_INSTANCES.map(async (api) => {
      const res = await fetch(`${api}/streams/${videoId}`, {
        signal: abortTimeout(5000),
      })
      if (!res.ok) throw new Error('Not OK')
      const data = await res.json()
      const audioStreams = data?.audioStreams || []
      if (audioStreams.length === 0) throw new Error('No audio streams')
      const best = audioStreams
        .filter((s: any) => s.url)
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0]
      if (!best) throw new Error('No valid stream')
      return {
        title: data.title || 'Unknown',
        author: data.uploader || 'Unknown',
        duration: String(data.duration || 0),
        audioUrl: proxyAudioUrl(best.url),
        thumbnail: data.thumbnailUrl || null,
      }
    }),
  )
  for (const r of results) {
    if (r.status === 'fulfilled') return r.value
  }
  return null
}

export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  if (!isNative()) {
    const piped = await pipedSearch(query)
    if (piped) return piped
  }

  const res = await fetch(FUNCTIONS_BASE(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'search', query }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error('Search failed')
  const data = await res.json()
  return data.results || []
}

export async function getVideoInfo(url: string): Promise<YouTubeInfo> {
  const videoId = extractVideoId(url)
  if (!videoId) throw new Error('Invalid YouTube URL')

  const [piped, server] = await Promise.allSettled([
    pipedInfo(videoId),
    (async () => {
      const res = await fetch(FUNCTIONS_BASE(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'info', url }),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error('Server fetch failed')
      const info: YouTubeInfo = await res.json()
      if (info.audioUrl) info.audioUrl = proxyAudioUrl(info.audioUrl)
      return info
    })(),
  ])

  if (piped.status === 'fulfilled' && piped.value?.audioUrl) return piped.value
  if (server.status === 'fulfilled' && server.value?.audioUrl) return server.value

  const errMsg = piped.status === 'rejected' ? piped.reason?.message : server.status === 'rejected' ? server.reason?.message : 'No audio found'
  throw new Error(`Failed to get video info: ${errMsg}`)
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
    if (m) return m[1] ?? null
  }
  return null
}
