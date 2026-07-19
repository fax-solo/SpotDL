import { checkRateLimit } from './rate_limit'
import { scrapeLog } from './log'

export async function searchDeezerArtwork(
  title: string,
  artist: string,
  ip: string,
  db: D1Database,
): Promise<string | null> {
  if (!title && !artist) return null
  const query = [artist, title].filter(Boolean).join(' ')

  const { allowed } = await checkRateLimit(db, `source:deezer-artwork:${ip}`, 30)
  if (!allowed) {
    scrapeLog('spotify', 'deezer_artwork_rate_limited', { title, artist })
    return null
  }

  try {
    const res = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=3&order=RANKING`,
      { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) return null
    const data = await res.json()
    const track = data?.data?.[0]
    if (!track) return null
    const artwork = track.album?.cover_big || track.album?.cover_medium || null
    if (artwork) scrapeLog('spotify', 'deezer_artwork', { title, artist, found: true })
    return artwork
  } catch {
    return null
  }
}
