import { fetchWithRetry, scrapeResponse, scrapeError, isFailFast } from './_lib/retry.js'
import { scrapeLog } from './_lib/log.js'
import { checkRateLimit } from './_lib/rate_limit'

const CLIENTS = [
  { name: 'ANDROID_v1', context: { client: { clientName: 'ANDROID', clientVersion: '18.37.36', androidSdkVersion: 30, osName: 'Android', osVersion: '13', platform: 'MOBILE', gl: 'US', hl: 'en' } } },
  { name: 'ANDROID_v2', context: { client: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, osName: 'Android', osVersion: '13', platform: 'MOBILE', gl: 'US', hl: 'en' } } },
  { name: 'ANDROID_MUSIC', context: { client: { clientName: 'ANDROID_MUSIC', clientVersion: '6.27.52', androidSdkVersion: 30, osName: 'Android', osVersion: '13', platform: 'MOBILE', gl: 'US', hl: 'en' } } },
  { name: 'TV', context: { client: { clientName: 'TVHTML5', clientVersion: '7.20240101.00.00', gl: 'US', hl: 'en' } } },
  { name: 'WEB_REMIX', context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', gl: 'US', hl: 'en' } } },
  { name: 'WEB', context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', gl: 'US', hl: 'en' } } },
]

const COOKIES = 'CONSENT=YES+; SOCS=CAISHAgCEhJqOHNfVUJfMl9xMHpKNHBpM1cYAiIBBiA='
const TIMEOUT = 5000
const CACHE_TTL = 60000

const _searchCache = new Map()
const _infoCache = new Map()

const _rateLimitedClients = new Map()
const RATE_LIMIT_COOLDOWN = 60000

function getNextStartIndex() {
  return crypto.getRandomValues(new Uint8Array(1))[0] % CLIENTS.length
}

function isClientRateLimited(name) {
  const until = _rateLimitedClients.get(name)
  return until && Date.now() < until
}

function markClientRateLimited(name) {
  _rateLimitedClients.set(name, Date.now() + RATE_LIMIT_COOLDOWN)
  if (_rateLimitedClients.size > CLIENTS.length * 2) {
    const now = Date.now()
    for (const [k, v] of _rateLimitedClients) {
      if (now >= v) _rateLimitedClients.delete(k)
    }
  }
}

function getHealthyClients() {
  const now = Date.now()
  for (const [k, v] of _rateLimitedClients) {
    if (now >= v) _rateLimitedClients.delete(k)
  }
  return CLIENTS.filter(c => !_rateLimitedClients.has(c.name))
}

function getCache(map, key) {
  const entry = map.get(key)
  if (entry && Date.now() < entry.expires) return entry.data
  return null
}

function setCache(map, key, data, ttl = CACHE_TTL) {
  map.set(key, { data, expires: Date.now() + ttl })
  if (map.size > 100) {
    const now = Date.now()
    let deleted = 0
    for (const [k, v] of map) { if (now >= v.expires) { map.delete(k); deleted++ } }
    if (deleted === 0 && map.size > 100) {
      const oldest = [...map.entries()].sort((a, b) => a[1].expires - b[1].expires)[0]
      if (oldest) map.delete(oldest[0])
    }
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

async function tryClient(client, endpoint, body) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': COOKIES, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
    body: JSON.stringify({ context: client.context, ...body }),
    signal: AbortSignal.timeout(TIMEOUT),
  })

  if (res.status === 429) {
    markClientRateLimited(client.name)
    return { error: 'rate_limited', status: 429 }
  }
  if (res.status === 404) {
    return { error: 'not_found', status: 404 }
  }
  if (isFailFast(res.status)) {
    return { error: 'client_failed', status: res.status }
  }
  if (!res.ok) {
    return { error: 'http_error', status: res.status }
  }

  return { data: await res.json() }
}

async function tryClientSequentially(clients, endpoint, body, logPrefix) {
  for (const client of clients) {
    if (isClientRateLimited(client.name)) continue

    const result = await tryClient(client, endpoint, body)
    if (result.error === 'rate_limited') {
      scrapeLog('youtube', `${logPrefix}_rate_limited`, { client: client.name })
      continue
    }
    if (result.error === 'not_found') {
      scrapeLog('youtube', `${logPrefix}_not_found`, { client: client.name })
      continue
    }
    if (result.error === 'client_failed') {
      scrapeLog('youtube', `${logPrefix}_failed`, { client: client.name, status: result.status })
      continue
    }
    if (result.error) {
      scrapeLog('youtube', `${logPrefix}_error`, { client: client.name, status: result.status })
      continue
    }

    scrapeLog('youtube', `${logPrefix}_ok`, { client: client.name })
    return result.data
  }
  return null
}

async function clientSearch(client, query, key) {
  const endpoint = `https://www.youtube.com/youtubei/v1/search?key=${key}`
  const result = await tryClient(client, endpoint, { query })
  if (result.error) throw result
  return result.data
}

async function handleSearch(query, key) {
  const cached = getCache(_searchCache, query)
  if (cached) {
    return scrapeResponse({ results: cached })
  }

  const healthy = getHealthyClients()
  if (healthy.length === 0) {
    scrapeLog('youtube', 'search_all_rate_limited', { query })
    return scrapeResponse({ results: [] })
  }

  const startIdx = getNextStartIndex()
  const ordered = [...healthy.slice(startIdx), ...healthy.slice(0, startIdx)]

  const data = await tryClientSequentially(ordered, `https://www.youtube.com/youtubei/v1/search?key=${key}`, { query }, 'search')

  if (data) {
    const results = parseSearchResults(data)
    if (results.length > 0) {
      setCache(_searchCache, query, results)
      return scrapeResponse({ results })
    }
  }

  scrapeLog('youtube', 'search_no_results', { query })
  return scrapeResponse({ results: [] })
}

function parseSearchResults(data) {
  const results = []
  const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || []
  for (const section of sections) {
    for (const item of (section?.itemSectionRenderer?.contents || [])) {
      const r = item?.videoRenderer
      if (!r?.videoId) continue
      const ownerRuns = r?.ownerText?.runs || r?.longBylineText?.runs || []
      results.push({ videoId: r.videoId, title: r.title?.runs?.[0]?.text || 'Unknown', author: ownerRuns[0]?.text || 'Unknown', url: `https://youtube.com/watch?v=${r.videoId}` })
      if (results.length >= 5) break
    }
    if (results.length >= 5) break
  }
  return results
}

async function handleMusicSearch(query, key) {
  const cached = getCache(_searchCache, 'music:' + query)
  if (cached) {
    return scrapeResponse({ results: cached })
  }

  const healthy = getHealthyClients()
  if (healthy.length === 0) {
    scrapeLog('youtube', 'music_search_all_rate_limited', { query })
    return scrapeResponse({ results: [] })
  }

  const startIdx = getNextStartIndex()
  const ordered = [...healthy.slice(startIdx), ...healthy.slice(0, startIdx)]

  const data = await tryClientSequentially(ordered, `https://music.youtube.com/youtubei/v1/search?key=${key}`, { query }, 'music_search')

  if (data) {
    const results = parseMusicSearchResults(data)
    if (results.length > 0) {
      setCache(_searchCache, 'music:' + query, results)
      return scrapeResponse({ results })
    }
  }

  // Fallback: try regular search
  scrapeLog('youtube', 'music_search_fallback_to_search', { query })
  return handleSearch(query, key)
}

function parseMusicSearchResults(data) {
  const results = []
  const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs || []
  for (const tab of tabs) {
    const tabRenderer = tab?.tabRenderer
    if (!tabRenderer) continue
    const tabTitle = typeof tabRenderer.title === 'string' ? tabRenderer.title : tabRenderer.title?.runs?.[0]?.text || ''
    if (tabTitle !== 'Songs') continue
    const sections = tabRenderer?.content?.sectionListRenderer?.contents || []
    for (const section of sections) {
      const shelf = section?.musicShelfRenderer
      if (!shelf) continue
      for (const item of (shelf.contents || [])) {
        const r = item?.musicResponsiveListItemRenderer
        if (!r?.videoId) continue
        const title = r?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'Unknown'
        const subtitleRuns = r?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []
        const author = subtitleRuns[0]?.text || 'Unknown'
        const thumbnails = r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || []
        results.push({
          videoId: r.videoId, title, author,
          url: `https://music.youtube.com/watch?v=${r.videoId}`,
          thumbnail: thumbnails[thumbnails.length - 1]?.url || null,
        })
        if (results.length >= 10) break
      }
      if (results.length >= 10) break
    }
    if (results.length >= 10) break
  }
  return results
}

async function handleInfo(videoUrl, key) {
  const videoId = extractVideoId(videoUrl)
  if (!videoId) {
    return scrapeError('invalid_url', 'Invalid YouTube URL', 400)
  }

  const cached = getCache(_infoCache, videoId)
  if (cached) {
    return scrapeResponse(cached)
  }

  const healthy = getHealthyClients()
  if (healthy.length === 0) {
    scrapeLog('youtube', 'info_all_rate_limited', { videoId })
    return scrapeError('rate_limited', 'All YouTube clients rate limited, try again shortly', 429)
  }

  const startIdx = getNextStartIndex()
  const ordered = [...healthy.slice(startIdx), ...healthy.slice(0, startIdx)]

  for (const client of ordered) {
    if (isClientRateLimited(client.name)) continue

    const data = await tryClient(client, `https://www.youtube.com/youtubei/v1/player?key=${key}`, { videoId })

    if (data.error === 'rate_limited') {
      scrapeLog('youtube', 'info_rate_limited', { client: client.name, videoId })
      continue
    }
    if (data.error === 'not_found') {
      scrapeLog('youtube', 'info_not_found', { client: client.name, videoId })
      return scrapeError('source_unavailable', 'YouTube video not found', 404)
    }
    if (data.error) {
      scrapeLog('youtube', 'info_client_error', { client: client.name, videoId, status: data.status })
      continue
    }

    const ps = data.data?.playabilityStatus
    if (ps?.status && ps.status !== 'OK') {
      scrapeLog('youtube', 'info_not_playable', { client: client.name, videoId, status: ps.status })
      // If the video is genuinely unavailable, fail fast — no other client will resolve it
      const unplayableErrors = ['UNPLAYABLE', 'CONTENT_CHECK_REQUIRED', 'AGE_CHECK_REQUIRED', 'LOGIN_REQUIRED', 'UNKNOWN']
      if (unplayableErrors.includes(ps.status)) {
        return scrapeError('source_unavailable', 'YouTube video not available', 502)
      }
      continue
    }

    const result = extractAudio(data.data)
    if (!result) {
      scrapeLog('youtube', 'info_no_audio', { client: client.name, videoId })
      continue
    }

    scrapeLog('youtube', 'info_ok', { client: client.name, videoId })
    setCache(_infoCache, videoId, result, 30000)
    return scrapeResponse(result)
  }

  scrapeLog('youtube', 'info_exhausted', { videoId })
  return scrapeError('source_unavailable', 'Could not retrieve audio from any YouTube client', 502)
}

function extractAudio(data) {
  const sd = data?.streamingData
  if (!sd) return null
  const all = [...(sd.formats || []), ...(sd.adaptiveFormats || [])]
  const audio = all.filter(f => f.mimeType?.startsWith('audio/') && f.url).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
  if (!audio[0]) return null
  const v = data?.videoDetails || {}
  return { title: v.title || 'Unknown', author: v.author || v.channelOwnerName || 'Unknown', duration: v.lengthSeconds || '0', audioUrl: audio[0].url, thumbnail: v.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || null }
}

function extractVideoId(url) {
  const patterns = [/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/, /youtu\.be\/([a-zA-Z0-9_-]{11})/, /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/, /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/]
  for (const p of patterns) { const m = p.exec(url); if (m) return m[1] }
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
  const { allowed } = await checkRateLimit(context.env.DB, `source:youtube:${ip}`, 30)
  if (!allowed) {
    return scrapeError('rate_limited', 'Too many requests. Try again later.', 429)
  }

  const key = context.env?.YOUTUBE_API_KEY || ''
  if (!key) {
    return new Response(JSON.stringify({ error: 'YouTube API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
  try {
    const { action, query, url } = await context.request.json()
    if (action === 'search') return await handleSearch(query, key)
    if (action === 'music-search') return await handleMusicSearch(query, key)
    if (action === 'info') return await handleInfo(url, key)
    return scrapeError('invalid_action', 'Invalid action', 400)
  } catch (err) {
    scrapeLog('youtube', 'error', { message: err.message?.substring(0, 200)?.replace(/key=[^&\s]+/gi, 'key=REDACTED') })
    return scrapeError('internal_error', err.message, 500)
  }
}
