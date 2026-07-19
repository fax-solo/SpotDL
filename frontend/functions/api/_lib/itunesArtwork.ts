import { checkRateLimit } from './rate_limit'
import { scrapeLog } from './log'

export async function searchItunesArtwork(
  title: string,
  artist: string,
  ip: string,
  db: D1Database,
): Promise<string | null> {
  if (!title && !artist) return null
  const query = [artist, title].filter(Boolean).join(' ')

  const { allowed } = await checkRateLimit(db, `source:itunes-artwork:${ip}`, 30)
  if (!allowed) {
    scrapeLog('spotify', 'itunes_artwork_rate_limited', { title, artist })
    return null
  }

  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=3`,
      { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) return null
    const data = await res.json()
    const track = data?.results?.find((t: any) => t.kind === 'song')
    if (!track) return null
    const artwork = track.artworkUrl100
      ? track.artworkUrl100.replace('100x100', '600x600')
      : null
    if (artwork) scrapeLog('spotify', 'itunes_artwork', { title, artist, found: true })
    return artwork
  } catch {
    return null
  }
}
