const FUNCTIONS_BASE = '/.netlify/functions/youtube'

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

export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
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
