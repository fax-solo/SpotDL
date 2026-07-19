import { checkRateLimit } from './_lib/rate_limit'
import { scrapeResponse, scrapeError } from './_lib/retry'
import { scrapeLog } from './_lib/log'

const ITUNES_API = 'https://itunes.apple.com'

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown'
  const { allowed } = await checkRateLimit(context.env.DB, `source:itunes:${ip}`, 30)
  if (!allowed) {
    return scrapeError('rate_limited', 'Too many requests. Try again later.', 429)
  }

  try {
    const { action, query, id } = await context.request.json()

    if (action === 'search') return await handleSearch(query)
    if (action === 'track') return await handleTrack(id)
    return scrapeError('invalid_action', 'Invalid action', 400)
  } catch (err) {
    scrapeLog('itunes', 'error', { message: err.message })
    return scrapeError('internal_error', err.message, 500)
  }
}

async function handleSearch(query) {
  try {
    const res = await fetch(
      `${ITUNES_API}/search?term=${encodeURIComponent(query)}&media=music&limit=5`,
      {
        headers: { 'Accept': 'application/json' },
      },
    )
    if (!res.ok) {
      scrapeLog('itunes', 'search_failed', { query, status: res.status })
      return scrapeResponse({ results: [] })
    }

    const data = await res.json()
    const tracks = data?.results || []

    const results = tracks
      .filter(t => t.kind === 'song')
      .map(t => ({
        url: String(t.trackId),
        title: t.trackName || 'Unknown',
        artist: t.artistName || 'Unknown',
        album: t.collectionName || null,
        duration: String(t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : 0),
        artworkUrl: t.artworkUrl100
          ? t.artworkUrl100.replace('100x100', '600x600')
          : null,
        source: 'itunes',
      }))

    scrapeLog('itunes', 'search_ok', { query, results: results.length })
    return scrapeResponse({ results })
  } catch (err) {
    scrapeLog('itunes', 'search_exception', { query, message: err.message })
    return scrapeResponse({ results: [] })
  }
}

async function handleTrack(id) {
  try {
    const res = await fetch(`${ITUNES_API}/lookup?id=${id}`, {
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) {
      scrapeLog('itunes', 'track_not_found', { id, status: res.status })
      return scrapeError('source_unavailable', 'Track not found', 404)
    }

    const data = await res.json()
    const t = data?.results?.[0] || null
    if (!t || t.kind !== 'song') {
      return scrapeError('source_unavailable', 'Track not found', 404)
    }

    return scrapeResponse({
      title: t.trackName,
      author: t.artistName,
      album: t.collectionName || null,
      duration: String(t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : 0),
      artworkUrl: t.artworkUrl100
        ? t.artworkUrl100.replace('100x100', '600x600')
        : null,
    })
  } catch (err) {
    scrapeLog('itunes', 'track_exception', { id, message: err.message })
    return scrapeError('source_unavailable', 'iTunes track lookup failed', 502)
  }
}
