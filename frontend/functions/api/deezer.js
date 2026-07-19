import { checkRateLimit } from './_lib/rate_limit'
import { scrapeResponse, scrapeError } from './_lib/retry'
import { scrapeLog } from './_lib/log'

const DEEZER_API = 'https://api.deezer.com'

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown'
  const { allowed } = await checkRateLimit(context.env.DB, `source:deezer:${ip}`, 30)
  if (!allowed) {
    return scrapeError('rate_limited', 'Too many requests. Try again later.', 429)
  }

  try {
    const { action, query, id } = await context.request.json()

    if (action === 'search') return await handleSearch(query)
    if (action === 'track' || action === 'info') return await handleTrack(id)
    if (action === 'isrc') return await handleIsrc(query)
    return scrapeError('invalid_action', 'Invalid action', 400)
  } catch (err) {
    scrapeLog('deezer', 'error', { message: err.message })
    return scrapeError('internal_error', err.message, 500)
  }
}

async function handleSearch(query) {
  try {
    const res = await fetch(
      `${DEEZER_API}/search?q=${encodeURIComponent(query)}&limit=5&order=RANKING`,
      { headers: { 'Accept': 'application/json' } },
    )
    if (!res.ok) {
      scrapeLog('deezer', 'search_failed', { query, status: res.status })
      return scrapeResponse({ results: [] })
    }

    const data = await res.json()
    const tracks = data?.data || []

    const results = tracks.map(t => ({
      url: String(t.id),
      title: t.title || 'Unknown',
      artist: t.artist?.name || 'Unknown',
      duration: String(t.duration || 0),
      audioUrl: t.preview || null,
      thumbnail: t.album?.cover_big || t.album?.cover_medium || null,
      source: 'deezer',
      isPreview: !!t.preview,
    }))

    scrapeLog('deezer', 'search_ok', { query, results: results.length })
    return scrapeResponse({ results })
  } catch (err) {
    scrapeLog('deezer', 'search_exception', { query, message: err.message })
    return scrapeResponse({ results: [] })
  }
}

async function handleTrack(id) {
  try {
    const res = await fetch(`${DEEZER_API}/track/${id}`, {
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) {
      scrapeLog('deezer', 'track_not_found', { id, status: res.status })
      return scrapeError('source_unavailable', 'Track not found', 404)
    }

    const t = await res.json()

    return scrapeResponse({
      title: t.title,
      author: t.artist?.name,
      duration: String(t.duration || 0),
      audioUrl: t.preview || null,
      thumbnail: t.album?.cover_big || null,
      isPreview: !!t.preview,
    })
  } catch (err) {
    scrapeLog('deezer', 'track_exception', { id, message: err.message })
    return scrapeError('source_unavailable', 'Deezer track lookup failed', 502)
  }
}

async function handleIsrc(isrc) {
  try {
    const res = await fetch(
      `${DEEZER_API}/search?q=isrc:${encodeURIComponent(isrc)}`,
      { headers: { 'Accept': 'application/json' } },
    )
    if (!res.ok) {
      scrapeLog('deezer', 'isrc_failed', { isrc, status: res.status })
      return scrapeResponse({ track: null })
    }

    const data = await res.json()
    const track = data?.data?.[0] || null

    if (!track) {
      return scrapeResponse({ track: null })
    }

    return scrapeResponse({
      track: {
        id: track.id,
        title: track.title,
        artist: track.artist?.name,
        album: track.album?.title,
        duration: String(track.duration || 0),
        isrc: track.isrc || null,
        thumbnail: track.album?.cover_big || null,
      },
    })
  } catch (err) {
    scrapeLog('deezer', 'isrc_exception', { isrc, message: err.message })
    return scrapeResponse({ track: null })
  }
}
