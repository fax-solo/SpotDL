function abortTimeout(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

const CLIENTS = [
  { name: 'ANDROID_v1', context: { client: { clientName: 'ANDROID', clientVersion: '18.37.36', androidSdkVersion: 30, osName: 'Android', osVersion: '13', platform: 'MOBILE', gl: 'US', hl: 'en' } } },
  { name: 'ANDROID_v2', context: { client: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, osName: 'Android', osVersion: '13', platform: 'MOBILE', gl: 'US', hl: 'en' } } },
  { name: 'ANDROID_MUSIC', context: { client: { clientName: 'ANDROID_MUSIC', clientVersion: '6.27.52', androidSdkVersion: 30, osName: 'Android', osVersion: '13', platform: 'MOBILE', gl: 'US', hl: 'en' } } },
  { name: 'TV', context: { client: { clientName: 'TVHTML5', clientVersion: '7.20240101.00.00', gl: 'US', hl: 'en' } } },
  { name: 'WEB_REMIX', context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', gl: 'US', hl: 'en' } } },
  { name: 'WEB', context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', gl: 'US', hl: 'en' } } },
]

// Fastest clients first
const FAST_CLIENTS = CLIENTS.filter(c => ['ANDROID_v1', 'ANDROID_v2', 'WEB_REMIX'].includes(c.name))
const ALL_CLIENTS = CLIENTS

const COOKIES = 'CONSENT=YES+; SOCS=CAISHAgCEhJqOHNfVUJfMl9xMHpKNHBpM1cYAiIBBiA='

const TIMEOUT = 5000
const CACHE_TTL = 60000 // 1 minute in-memory cache

const _searchCache = new Map()
const _infoCache = new Map()

function getCache(map, key) {
  const entry = map.get(key)
  if (entry && Date.now() < entry.expires) return entry.data
  return null
}

function setCache(map, key, data, ttl = CACHE_TTL) {
  map.set(key, { data, expires: Date.now() + ttl })
  if (map.size > 100) {
    const now = Date.now()
    for (const [k, v] of map) { if (now >= v.expires) map.delete(k) }
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

async function tryClientSearch(client, query, key) {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': COOKIES, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
    body: JSON.stringify({ context: client.context, query }),
    signal: abortTimeout(TIMEOUT),
  })
  if (!res.ok) throw new Error('not ok')
  const data = await res.json()
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
  if (results.length === 0) throw new Error('no results')
  return results
}

async function handleSearch(query, key) {
  const cached = getCache(_searchCache, query)
  if (cached) {
    return new Response(JSON.stringify({ results: cached }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  // Try all clients in parallel — first success wins
  const results = await Promise.any(
    FAST_CLIENTS.map(c => tryClientSearch(c, query, key))
  ).catch(async () => {
    // Fallback: try remaining clients
    const remaining = ALL_CLIENTS.filter(c => !FAST_CLIENTS.includes(c))
    return Promise.any(remaining.map(c => tryClientSearch(c, query, key)))
      .catch(() => null)
  })

  if (results && results.length > 0) {
    setCache(_searchCache, query, results)
    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  return new Response(JSON.stringify({ results: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

async function tryClientMusicSearch(client, query, key) {
  const res = await fetch(`https://music.youtube.com/youtubei/v1/search?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': COOKIES, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
    body: JSON.stringify({ context: client.context, query }),
    signal: abortTimeout(TIMEOUT),
  })
  if (!res.ok) throw new Error('not ok')
  const data = await res.json()
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
  if (results.length === 0) throw new Error('no music results')
  return results
}

async function handleMusicSearch(query, key) {
  const cached = getCache(_searchCache, 'music:' + query)
  if (cached) {
    return new Response(JSON.stringify({ results: cached }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  // Try music search with fastest clients in parallel
  const results = await Promise.any(
    FAST_CLIENTS.map(c => tryClientMusicSearch(c, query, key))
  ).catch(async () => {
    // Fallback to regular search
    return handleSearch(query, key).then(r => r.json()).then(d => d.results || [])
  })

  if (results && results.length > 0) {
    setCache(_searchCache, 'music:' + query, results)
    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  return new Response(JSON.stringify({ results: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

async function tryClientInfo(client, videoId, key) {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': COOKIES, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
    body: JSON.stringify({ context: client.context, videoId }),
    signal: abortTimeout(TIMEOUT),
  })
  if (!res.ok) throw new Error('not ok')
  const data = await res.json()
  const ps = data?.playabilityStatus
  if (ps?.status && ps.status !== 'OK') throw new Error('not playable')
  const result = extractAudio(data)
  if (!result) throw new Error('no audio')
  return result
}

async function handleInfo(videoUrl, key) {
  const videoId = extractVideoId(videoUrl)
  if (!videoId) {
    return new Response(JSON.stringify({ error: 'Invalid YouTube URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  const cached = getCache(_infoCache, videoId)
  if (cached) {
    return new Response(JSON.stringify(cached), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  const result = await Promise.any(
    FAST_CLIENTS.map(c => tryClientInfo(c, videoId, key))
  ).catch(async () => {
    return Promise.any(ALL_CLIENTS.map(c => tryClientInfo(c, videoId, key)))
      .catch(() => null)
  })

  if (result) {
    setCache(_infoCache, videoId, result, 30000) // 30s for audio URLs (they expire)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  return new Response(JSON.stringify({ error: 'Could not retrieve audio from any source' }), {
    status: 502,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
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
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
}
