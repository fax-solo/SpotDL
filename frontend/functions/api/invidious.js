import { scrapeResponse, scrapeError } from './_lib/retry.js'
import { scrapeLog } from './_lib/log.js'
import { filterHealthyInstances } from './_lib/instanceHealth.js'
import { checkRateLimit } from './_lib/rate_limit'

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://yt.artemislena.eu',
  'https://inv.bp.projectsegfau.lt',
  'https://invidious.private.coffee',
  'https://invidious.privacydev.net',
  'https://invidious.no-logs.com',
  'https://invidious.slipfox.xyz',
  'https://vid.puffyan.us',
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
]

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

function parseDuration(seconds) {
  return String(seconds || 0)
}

function extractVideoId(url) {
  if (!url) return null
  const m = url.match(/v=([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

async function invidiousSearch(query, instances, limit = 5) {
  const cacheKey = `search:${query}:${limit}`
  const cached = getCache(_searchCache, cacheKey)
  if (cached) return cached

  for (const base of instances) {
    try {
      const url = `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
      if (!res.ok) continue
      const data = await res.json()
      if (!Array.isArray(data) || data.length === 0) continue

      const results = data
        .filter(v => v.type === 'video' || v.videoId)
        .slice(0, limit)
        .map(v => ({
          title: v.title || 'Unknown',
          author: v.author || 'Unknown',
          videoId: v.videoId || '',
          duration: parseDuration(v.lengthSeconds),
          url: `https://youtube.com/watch?v=${v.videoId}`,
          thumbnail: v.videoThumbnails?.find(t => t.quality === 'medium')?.url
            || v.videoThumbnails?.[0]?.url
            || null,
        }))
        .filter(r => r.videoId)

      if (results.length > 0) {
        setCache(_searchCache, cacheKey, results)
        return results
      }
    } catch (e) {
      continue
    }
  }
  return []
}

async function invidiousVideoInfo(videoId, instances) {
  const cacheKey = `info:${videoId}`
  const cached = getCache(_searchCache, cacheKey)
  if (cached) return cached

  for (const base of instances) {
    try {
      const url = `${base}/api/v1/videos/${videoId}`
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
      if (!res.ok) continue
      const data = await res.json()
      if (!data || !data.videoId) continue

      let audioUrl = null
      const formats = data.adaptiveFormats || []
      const audioFormats = formats.filter(f => f.type?.startsWith('audio/') && f.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
      if (audioFormats.length > 0) {
        audioUrl = audioFormats[0].url
      }

      const result = {
        title: data.title || 'Unknown',
        author: data.author || 'Unknown',
        duration: parseDuration(data.lengthSeconds),
        audioUrl,
        thumbnail: data.videoThumbnails?.find(t => t.quality === 'medium')?.url
          || data.videoThumbnails?.[0]?.url
          || null,
      }

      setCache(_searchCache, cacheKey, result, 30000)
      return result
    } catch (e) {
      continue
    }
  }
  return null
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS })
  }

  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown'
  const { allowed } = await checkRateLimit(context.env.DB, `source:invidious:${ip}`, 30)
  if (!allowed) {
    return scrapeError('rate_limited', 'Too many requests. Try again later.', 429)
  }

  try {
    const healthyInstances = await filterHealthyInstances(
      INVIDIOUS_INSTANCES, '/api/v1/stats', 3000
    )

    const body = await context.request.json()
    if (body.action === 'search') {
      const results = await invidiousSearch(body.query, healthyInstances, body.limit || 5)
      if (results.length > 0) return scrapeResponse({ results })
      return scrapeError('no_results', 'No YouTube results via Invidious', 404)
    }
    if (body.action === 'info') {
      const videoId = body.url ? extractVideoId(body.url) : body.id
      if (!videoId) return scrapeError('invalid_url', 'Invalid YouTube URL', 400)
      const info = await invidiousVideoInfo(videoId, healthyInstances)
      if (info) return scrapeResponse(info)
      return scrapeError('not_found', 'Video not found via Invidious', 404)
    }
    return scrapeError('invalid_action', 'Invalid action', 400)
  } catch (err) {
    scrapeLog('invidious', 'error', { message: err.message?.substring(0, 200) })
    return scrapeError('internal_error', err.message, 500)
  }
}
