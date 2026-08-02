import { checkRateLimit } from './rate_limit'
import { scrapeLog } from './log'

const API_KEY = '7a5d0a2a4b1e8c3f6d9e0f1a2b3c4d5e'
const API_BASE = 'https://ws.audioscrobbler.com/2.0'

export async function searchLastfmArtwork(
  title: string,
  artist: string,
  ip: string,
  db: D1Database,
  apiKey?: string,
): Promise<string | null> {
  if (!title && !artist) return null

  const { allowed } = await checkRateLimit(db, `source:lastfm-artwork:${ip}`, 30)
  if (!allowed) {
    scrapeLog('lastfm', 'artwork_rate_limited', { title, artist })
    return null
  }

  const params = new URLSearchParams({
    method: 'track.getInfo',
    api_key: apiKey || API_KEY,
    artist,
    track: title,
    format: 'json',
    autocorrect: '1',
  })

  try {
    const res = await fetch(`${API_BASE}?${params}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data: any = await res.json()
    if (data?.error) return null

    const track = data?.track
    if (!track) return null

    const album = track.album
    if (!album?.image) return null

    const images = album.image
    const preferred = images.find((i: any) => i.size === 'extralarge')
      || images.find((i: any) => i.size === 'large')
      || images.find((i: any) => i.size === 'medium')
      || images[images.length - 1]

    const url = preferred?.['#text'] || null
    if (url) scrapeLog('lastfm', 'artwork_found', { title, artist, size: preferred.size })
    return url
  } catch {
    return null
  }
}
