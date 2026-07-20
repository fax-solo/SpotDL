import { checkRateLimit } from './rate_limit'
import { scrapeLog } from './log'

const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2'
const COVERART_URL = 'https://coverartarchive.org/release'

export async function searchCoverArtArchive(
  title: string,
  artist: string,
  isrc: string | null,
  ip: string,
  db: D1Database,
): Promise<string | null> {
  if (!title && !artist && !isrc) return null

  const { allowed } = await checkRateLimit(db, `source:coverart:${ip}`, 20)
  if (!allowed) {
    scrapeLog('coverart', 'rate_limited', { title, artist })
    return null
  }

  let releaseMbid: string | null = null

  if (isrc) {
    releaseMbid = await _mbidFromIsrc(isrc)
  }

  if (!releaseMbid && artist && title) {
    releaseMbid = await _mbidFromTrack(artist, title)
  }

  if (!releaseMbid) return null

  try {
    const res = await fetch(`${COVERART_URL}/${releaseMbid}/front-250`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      if (res.status !== 404) {
        scrapeLog('coverart', 'fetch_failed', { releaseMbid, status: res.status })
      }
      return null
    }
    const blob = await res.blob()
    const url = `${COVERART_URL}/${releaseMbid}/front-250`
    scrapeLog('coverart', 'found', { title, artist, releaseMbid })
    return url
  } catch {
    return null
  }
}

async function _mbidFromTrack(artist: string, title: string): Promise<string | null> {
  const query = encodeURIComponent(`artist:"${artist}" AND recording:"${title}"`)
  try {
    const res = await fetch(
      `${MUSICBRAINZ_API}/recording/?query=${query}&limit=3&fmt=json`,
      { headers: { 'User-Agent': 'Sinc/1.0' }, signal: AbortSignal.timeout(6000) },
    )
    if (!res.ok) return null
    const data: any = await res.json()
    const recordings = data?.recordings || []
    for (const rec of recordings) {
      const releases = rec?.releases || []
      if (releases.length > 0) {
        return releases[0].id
      }
    }
    return null
  } catch {
    return null
  }
}

async function _mbidFromIsrc(isrc: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${MUSICBRAINZ_API}/recording/?query=isrc:${isrc}&limit=1&fmt=json`,
      { headers: { 'User-Agent': 'Sinc/1.0' }, signal: AbortSignal.timeout(6000) },
    )
    if (!res.ok) return null
    const data: any = await res.json()
    const rec = data?.recordings?.[0]
    if (!rec) return null
    const releases = rec?.releases || []
    return releases.length > 0 ? releases[0].id : null
  } catch {
    return null
  }
}
