import { apiUrl } from './apiConfig'
import { fetchLyricsFallback } from './lyricsFallback'
import { cacheMetadata, getCachedMetadata } from './dbCache'

export interface LyricsResult {
  plainLyrics: string | null
  syncedLyrics: string | null
}

const inMemoryCache = new Map<string, LyricsResult>()
const CACHE_MAX = 200

export async function fetchLyricsWithFallback(
  trackName: string,
  artistName: string,
  albumName?: string,
  duration?: number,
  signal?: AbortSignal,
): Promise<LyricsResult> {
  const cacheKey = `${artistName}||${trackName}||${albumName || ''}`

  const memCached = inMemoryCache.get(cacheKey)
  if (memCached) return memCached

  const dbCached = await getCachedMetadata<LyricsResult>(`lyrics:${cacheKey}`)
  if (dbCached) {
    inMemoryCache.set(cacheKey, dbCached)
    return dbCached
  }

  let result: LyricsResult = { plainLyrics: null, syncedLyrics: null }

  try {
    const res = await fetch(apiUrl('/api/lyrics'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trackName,
        artistName,
        albumName: albumName || undefined,
        duration: duration || undefined,
      }),
      signal: signal || AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = await res.json()
      result = {
        plainLyrics: data.plainLyrics || null,
        syncedLyrics: data.syncedLyrics || null,
      }
    }
  } catch {
    // fall through to client-side fallback
  }

  if (!result.plainLyrics && !result.syncedLyrics) {
    try {
      const fallback = await fetchLyricsFallback(artistName, trackName)
      if (fallback && (fallback.plainLyrics || fallback.syncedLyrics)) {
        result = fallback
      }
    } catch {
      // no lyrics available
    }
  }

  if (result.plainLyrics || result.syncedLyrics) {
    inMemoryCache.set(cacheKey, result)
    if (inMemoryCache.size > CACHE_MAX) {
      const first = inMemoryCache.keys().next().value
      if (first !== undefined) inMemoryCache.delete(first)
    }
    cacheMetadata(`lyrics:${cacheKey}`, result).catch(() => {})
  }

  return result
}
