import { scrapeResponse, scrapeError } from './_lib/retry.js'
import { scrapeLog } from './_lib/log.js'
import { checkRateLimit } from './_lib/rate_limit'

const FMA_API = 'https://freemusicarchive.org/api'
const FMA_SEARCH = 'https://freemusicarchive.org/search'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const _cache = new Map()
const CACHE_TTL = 120000

function getCache(key) {
  const entry = _cache.get(key)
  if (entry && Date.now() < entry.expires) return entry.data
  return null
}

function setCache(key, data, ttl = CACHE_TTL) {
  _cache.set(key, { data, expires: Date.now() + ttl })
  if (_cache.size > 100) {
    const now = Date.now()
    for (const [k, v] of _cache) { if (now >= v.expires) _cache.delete(k) }
  }
}

async function fmaSearch(query, limit = 10) {
  const cacheKey = `search:${query}:${limit}`
  const cached = getCache(cacheKey)
  if (cached) return cached

  try {
    const url = `${FMA_SEARCH}?quicksearch=${encodeURIComponent(query)}&search_type=all`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Sinc/1.0' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []

    const html = await res.text()
    const results = []

    const trackRegex = /<div class="play-item"[^>]*data-track-id="(\d+)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g
    let match
    while ((match = trackRegex.exec(html)) !== null) {
      const block = match[0]
      const trackId = match[1]

      const titleMatch = block.match(/<a[^>]+class="[^"]*title[^"]*"[^>]*>([^<]+)</)
      const title = titleMatch ? titleMatch[1].trim() : 'Unknown'

      const artistMatch = block.match(/<a[^>]+class="[^"]*artist[^"]*"[^>]*>([^<]+)</)
      const artist = artistMatch ? artistMatch[1].trim() : 'Unknown'

      const fileMatch = block.match(/data-file-url="([^"]+)"/)
      const audioUrl = fileMatch ? fileMatch[1] : null

      if (audioUrl) {
        results.push({
          id: trackId,
          title,
          artist,
          audioUrl,
          source: 'fma',
          thumbnail: null,
          duration: null,
        })
      }

      if (results.length >= limit) break
    }

    setCache(cacheKey, results)
    return results
  } catch (e) {
    scrapeLog('fma', 'search_failed', { query, err: e?.message })
    return []
  }
}

async function fmaTrackInfo(trackId) {
  const cacheKey = `track:${trackId}`
  const cached = getCache(cacheKey)
  if (cached) return cached

  try {
    const url = `https://freemusicarchive.org/music/track/${trackId}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Sinc/1.0' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null

    const html = await res.text()

    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/)
    const audioMatch = html.match(/<meta\s+property="og:audio"\s+content="([^"]+)"/)
    const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/)
    const artistMatch = html.match(/<meta\s+name="author"\s+content="([^"]+)"/)

    if (!audioMatch) return null

    const result = {
      title: titleMatch ? titleMatch[1] : 'Unknown',
      author: artistMatch ? artistMatch[1] : 'Unknown',
      audioUrl: audioMatch[1],
      thumbnail: imageMatch ? imageMatch[1] : null,
      duration: null,
    }

    setCache(cacheKey, result)
    return result
  } catch (e) {
    scrapeLog('fma', 'track_info_failed', { trackId, err: e?.message })
    return null
  }
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS })
  }

  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown'
  const { allowed } = await checkRateLimit(context.env.DB, `source:fma:${ip}`, 30)
  if (!allowed) {
    return scrapeError('rate_limited', 'Too many requests. Try again later.', 429)
  }

  try {
    const body = await context.request.json()

    if (body.action === 'search') {
      const results = await fmaSearch(body.query, body.limit || 10)
      if (results.length > 0) return scrapeResponse({ results })
      return scrapeError('no_results', 'No results on Free Music Archive', 404)
    }

    if (body.action === 'info') {
      const info = await fmaTrackInfo(body.url || body.id)
      if (info) return scrapeResponse(info)
      return scrapeError('not_found', 'Track not found on Free Music Archive', 404)
    }

    return scrapeError('invalid_action', 'Invalid action', 400)
  } catch (err) {
    scrapeLog('fma', 'error', { message: err.message?.substring(0, 200) })
    return scrapeError('internal_error', err.message, 500)
  }
}
