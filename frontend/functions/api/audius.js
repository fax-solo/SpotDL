import { scrapeResponse, scrapeError } from './_lib/retry.js'
import { scrapeLog } from './_lib/log.js'
import { checkRateLimit } from './_lib/rate_limit'

const AUDIUS_API = 'https://api.audius.co'
const AUDIUS_DEFAULT_TOKEN = ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const _searchCache = new Map()
const SEARCH_CACHE_TTL = 60000

function getCache(map, key) {
  const entry = map.get(key)
  if (entry && Date.now() < entry.expires) return entry.data
  return null
}

function setCache(map, key, data, ttl = SEARCH_CACHE_TTL) {
  map.set(key, { data, expires: Date.now() + ttl })
  if (map.size > 100) {
    const now = Date.now()
    for (const [k, v] of map) { if (now >= v.expires) map.delete(k) }
  }
}

async function audiusFetch(path) {
  const res = await fetch(`${AUDIUS_API}${path}`, {
    headers: { 'User-Agent': 'Sinc/1.0' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  return res.json()
}

async function searchAudius(query, limit = 10) {
  const cacheKey = `search:${query}:${limit}`
  const cached = getCache(_searchCache, cacheKey)
  if (cached) return cached

  const data = await audiusFetch(`/v1/tracks/search?query=${encodeURIComponent(query)}&limit=${limit}`)
  if (!data?.data) return []

  const results = data.data.map(t => ({
    id: t.id,
    title: t.title || 'Unknown',
    artist: t.user?.name || t.user?.handle || 'Unknown',
    duration: String(Math.floor((t.duration || 0))),
    audioUrl: t.downloadable
      ? `${AUDIUS_API}/v1/tracks/${t.id}/download`
      : `${AUDIUS_API}/v1/tracks/${t.id}/stream`,
    thumbnail: (t.artwork?._480x480 || t.artwork?._150x150 || null),
    source: 'audius',
    genre: t.genre || null,
    mood: t.mood || null,
  }))

  setCache(_searchCache, cacheKey, results)
  return results
}

async function trackInfo(trackId) {
  const cacheKey = `track:${trackId}`
  const cached = getCache(_searchCache, cacheKey)
  if (cached) return cached

  const data = await audiusFetch(`/v1/tracks/${trackId}`)
  if (!data?.data) return null

  const t = data.data
  const result = {
    title: t.title || 'Unknown',
    author: t.user?.name || t.user?.handle || 'Unknown',
    duration: String(Math.floor((t.duration || 0))),
    audioUrl: t.downloadable
      ? `${AUDIUS_API}/v1/tracks/${t.id}/download`
      : `${AUDIUS_API}/v1/tracks/${t.id}/stream`,
    thumbnail: (t.artwork?._480x480 || t.artwork?._150x150 || null),
    genre: t.genre || null,
  }

  setCache(_searchCache, cacheKey, result)
  return result
}

async function handleSearch(query, limit) {
  const results = await searchAudius(query, limit)
  if (results.length > 0) return scrapeResponse({ results })
  return scrapeError('no_results', 'No results found on Audius', 404)
}

async function handleInfo(trackId) {
  const info = await trackInfo(trackId)
  if (info) return scrapeResponse(info)
  return scrapeError('not_found', 'Track not found on Audius', 404)
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS })
  }

  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown'
  const { allowed } = await checkRateLimit(context.env.DB, `source:audius:${ip}`, 30)
  if (!allowed) {
    return scrapeError('rate_limited', 'Too many requests. Try again later.', 429)
  }

  try {
    const body = await context.request.json()
    if (body.action === 'search') return await handleSearch(body.query, body.limit || 10)
    if (body.action === 'info') return await handleInfo(body.url || body.id)
    return scrapeError('invalid_action', 'Invalid action', 400)
  } catch (err) {
    scrapeLog('audius', 'error', { message: err.message?.substring(0, 200) })
    return scrapeError('internal_error', err.message, 500)
  }
}
