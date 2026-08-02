import { searchDeezerArtwork } from './deezerArtwork'
import { searchItunesArtwork } from './itunesArtwork'
import { searchLastfmArtwork } from './lastfmArtwork'
import { searchCoverArtArchive } from './coverArtArchive'
import { scrapeLog } from './log'

interface ArtworkContext {
  ip: string
  db: D1Database
  isrc?: string | null
  env?: { LASTFM_API_KEY?: string }
}

// Canonical fallback chain. Order matters: prefer providers with the most
// reliable metadata, then the most permissive ones. Keep in sync with:
//   - api/artwork_fallback.py (FastAPI)
//   - app/src/main/kotlin/com/sinc/enhanced/data/remote/ArtworkClient.kt
const ARTWORK_SOURCES = [
  { name: 'deezer', fn: searchDeezerArtwork },
  { name: 'itunes', fn: searchItunesArtwork },
  { name: 'lastfm', fn: searchLastfmArtwork },
  { name: 'coverartarchive', fn: searchCoverArtArchive },
]

export async function findArtwork(
  title: string,
  artist: string,
  ctx: ArtworkContext,
): Promise<string | null> {
  if (!title && !artist) return null

  for (const source of ARTWORK_SOURCES) {
    try {
      let url: string | null = null

      if (source.name === 'coverartarchive') {
        url = await searchCoverArtArchive(title, artist, ctx.isrc || null, ctx.ip, ctx.db)
      } else if (source.name === 'lastfm') {
        url = await searchLastfmArtwork(title, artist, ctx.ip, ctx.db, ctx.env?.LASTFM_API_KEY)
      } else {
        url = await source.fn(title, artist, ctx.ip, ctx.db)
      }

      if (url) {
        scrapeLog('artworkFallback', 'found', { source: source.name, title, artist })
        return url
      }
    } catch (err) {
      scrapeLog('artworkFallback', 'error', { source: source.name, err: String(err) })
    }
  }

  return null
}

export async function findArtworkForTracks(
  tracks: Array<{ title: string; artist: string; isrc?: string | null }>,
  ctx: ArtworkContext,
  concurrency = 3,
): Promise<Map<number, string>> {
  const results = new Map<number, string>()

  for (let i = 0; i < tracks.length; i += concurrency) {
    const batch = tracks.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      batch.map(async (track, batchIdx) => {
        const url = await findArtwork(track.title, track.artist, {
          ...ctx,
          isrc: track.isrc || ctx.isrc,
        })
        if (url) results.set(i + batchIdx, url)
      })
    )
  }

  return results
}
