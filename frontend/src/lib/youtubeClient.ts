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

/**
 * Route an audio URL through the Cloudflare proxy to avoid browser CORS restrictions.
 * The single YouTube implementation lives in the /api/youtube Cloudflare Function,
 * which itself chains Piped instances, InnerTube, scraping and the Data API.
 */
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

export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  try {
    const res = await fetch(FUNCTIONS_BASE(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'search', query }),
      signal: abortTimeout(8000),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.results?.length) return data.results
    }
  } catch {}
  return []
}

export async function getVideoInfo(url: string): Promise<YouTubeInfo> {
  const videoId = extractVideoId(url)
  if (!videoId) throw new Error('Invalid YouTube URL')

  try {
    const res = await fetch(FUNCTIONS_BASE(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'info', url }),
      signal: abortTimeout(8000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const info: YouTubeInfo = await res.json()
    if (info.audioUrl) info.audioUrl = proxyAudioUrl(info.audioUrl)
    return info
  } catch (err) {
    throw new Error(`Failed to get video info: ${err instanceof Error ? err.message : String(err)}`)
  }
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
