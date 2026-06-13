const FUNCTIONS_BASE = '/.netlify/functions/youtube'
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.syncpundit.io',
]

export interface YouTubeSearchResult {
  videoId: string
  title: string
  url: string
}

export interface YouTubeInfo {
  title: string
  author: string
  duration: string
  audioUrl: string | null
  thumbnail: string | null
}

async function pipedSearch(query: string): Promise<YouTubeSearchResult[] | null> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}/search?q=${encodeURIComponent(query)}&filter=videos`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const data = await res.json()
      const items = data?.items || []
      const results = items
        .filter((item: any) => item.url?.includes('/watch?v='))
        .slice(0, 5)
        .map((item: any) => ({
          videoId: item.url.split('v=')[1]?.split('&')[0] || '',
          title: item.title || 'Unknown',
          url: item.url,
        }))
        .filter((r: YouTubeSearchResult) => r.videoId)
      if (results.length > 0) return results
    } catch {}
  }
  return null
}

async function pipedInfo(videoId: string): Promise<YouTubeInfo | null> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, {
        signal: AbortSignal.timeout(15000),
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
            audioUrl: best.url,
            thumbnail: data.thumbnailUrl || null,
          }
        }
      }
    } catch {}
  }
  return null
}

export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  // Try Piped API directly from browser first
  const piped = await pipedSearch(query)
  if (piped) return piped

  // Fallback: Netlify Function
  const res = await fetch(FUNCTIONS_BASE, {
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

  // Try Piped API directly from browser first
  const piped = await pipedInfo(videoId)
  if (piped && piped.audioUrl) return piped

  // Fallback: Netlify Function
  const res = await fetch(FUNCTIONS_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'info', url }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to get video info${body ? `: ${body}` : ''}`)
  }
  return res.json()
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const m = pattern.exec(url)
    if (m) return m[1]
  }
  return null
}
