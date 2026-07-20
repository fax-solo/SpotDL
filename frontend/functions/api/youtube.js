import { scrapeResponse, scrapeError } from './_lib/retry.js'
import { scrapeLog } from './_lib/log.js'
import { checkRateLimit } from './_lib/rate_limit'

const CACHE_TTL = 60000
const _searchCache = new Map()
const _infoCache = new Map()

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',        // 🇺🇸🇮🇳🇳🇱🇨🇦🇬🇧🇫🇷 (Official, CDN)
  'https://pipedapi.leptons.xyz',        // 🇦🇹 (CDN)
  'https://pipedapi.nosebs.ru',          // 🇫🇮 (CDN)
  'https://pipedapi-libre.kavin.rocks',  // 🇳🇱 (Official, no CDN)
  'https://piped-api.privacy.com.de',    // 🇩🇪
  'https://pipedapi.adminforge.de',      // 🇩🇪
  'https://api.piped.yt',               // 🇩🇪
  'https://pipedapi.drgns.space',        // 🇺🇸
  'https://pipedapi.owo.si',            // 🇩🇪
  'https://pipedapi.ducks.party',        // 🇳🇱
  'https://piped-api.codespace.cz',      // 🇨🇿
  'https://pipedapi.reallyaweso.me',     // 🇩🇪
  'https://api.piped.private.coffee',    // 🇦🇹
  'https://pipedapi.darkness.services',  // 🇺🇸
  'https://pipedapi.orangenet.cc',       // 🇸🇮
]

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'

// Known InnerTube API keys embedded in YouTube clients
const INNERTUBE_KEYS = [
  'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', // YouTube Web
  'AIzaSyC7i2F6H77R4uEqgPk0EwIqDxVJc9qPF8', // YouTube Android
  'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w', // YouTube Music
  'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc', // YouTube TV
]

const INNERTUBE_CLIENTS = [
  { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en', gl: 'US' },
  { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'en', gl: 'US' },
  { clientName: 'ANDROID_MUSIC', clientVersion: '6.27.52', androidSdkVersion: 30, hl: 'en', gl: 'US' },
]

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

async function apiSearch(query, key) {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=5&key=${key}`,
    { signal: AbortSignal.timeout(8000) }
  )
  if (!res.ok) return null
  const data = await res.json()
  return (data.items || []).map(item => ({
    videoId: item.id?.videoId || '',
    title: item.snippet?.title || 'Unknown',
    author: item.snippet?.channelTitle || 'Unknown',
    url: `https://youtube.com/watch?v=${item.id?.videoId}`,
    thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || null,
  })).filter(r => r.videoId)
}

async function apiVideoInfo(videoId, key) {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${key}`,
    { signal: AbortSignal.timeout(8000) }
  )
  if (!res.ok) return null
  const data = await res.json()
  const item = data.items?.[0]
  if (!item) return null
  const duration = parseDuration(item.contentDetails?.duration || 'PT0S')
  return {
    title: item.snippet?.title || 'Unknown',
    author: item.snippet?.channelTitle || 'Unknown',
    duration: String(duration),
    audioUrl: null,
    thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || null,
  }
}

function parseDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  return (parseInt(m[1] || '0') * 3600 + parseInt(m[2] || '0') * 60 + parseInt(m[3] || '0'))
}

async function pipedSearch(query) {
  const settled = await Promise.allSettled(
    PIPED_INSTANCES.map(api =>
      fetch(`${api}/search?q=${encodeURIComponent(query)}&filter=videos`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(5000),
      }).then(r => r.ok ? r.json() : Promise.reject())
    )
  )
  for (const r of settled) {
    if (r.status !== 'fulfilled' || !r.value?.items) continue
    const results = r.value.items
      .filter(item => item.url?.includes('/watch?v='))
      .slice(0, 5)
      .map(item => ({
        videoId: item.url.split('v=')[1]?.split('&')[0] || '',
        title: item.title || 'Unknown',
        author: item.uploaderName || item.uploader || 'Unknown',
        url: item.url.startsWith('http') ? item.url : `https://youtube.com${item.url}`,
        thumbnail: item.thumbnail || null,
      }))
      .filter(r => r.videoId)
    if (results.length > 0) return results
  }
  return null
}

async function scrapeSearch(query) {
  const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  const html = await res.text()
  const match = html.match(/ytInitialData\s*=\s*({.+?});\s*<\/script>/)
  if (!match) return null
  const data = JSON.parse(match[1])
  const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || []
  const results = []
  for (const section of contents) {
    for (const item of (section?.itemSectionRenderer?.contents || [])) {
      const r = item?.videoRenderer
      if (!r?.videoId) continue
      results.push({
        videoId: r.videoId,
        title: r.title?.runs?.[0]?.text || 'Unknown',
        author: r?.ownerText?.runs?.[0]?.text || r?.longBylineText?.runs?.[0]?.text || 'Unknown',
        url: `https://youtube.com/watch?v=${r.videoId}`,
        thumbnail: r?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || null,
      })
      if (results.length >= 5) break
    }
    if (results.length >= 5) break
  }
  return results.length > 0 ? results : null
}

async function handleSearch(query, key) {
  const cached = getCache(_searchCache, query)
  if (cached) return scrapeResponse({ results: cached })

  let results = null
  if (key) {
    try { results = await apiSearch(query, key) } catch (e) {
      scrapeLog('youtube', 'api_search_failed', { err: e?.message })
    }
  }
  if (!results) {
    try { results = await pipedSearch(query) } catch {}
  }
  if (!results) {
    try { results = await scrapeSearch(query) } catch (e) {
      scrapeLog('youtube', 'scrape_search_failed', { err: e?.message })
    }
  }

  if (results?.length > 0) {
    setCache(_searchCache, query, results)
    return scrapeResponse({ results })
  }
  scrapeLog('youtube', 'search_no_results', { query })
  return scrapeError('source_unavailable', 'YouTube search unavailable', 503)
}

async function pipedInfo(videoId) {
  const settled = await Promise.allSettled(
    PIPED_INSTANCES.map(api =>
      fetch(`${api}/streams/${videoId}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(5000),
      }).then(r => r.ok ? r.json() : Promise.reject())
    )
  )
  for (const r of settled) {
    if (r.status !== 'fulfilled' || !r.value) continue
    const d = r.value
    const audioStreams = d.audioStreams || []
    if (audioStreams.length === 0) continue
    const best = audioStreams.filter(s => s.url).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]
    if (!best) continue
    return {
      title: d.title || 'Unknown',
      author: d.uploader || 'Unknown',
      duration: String(d.duration || 0),
      audioUrl: best.url,
      thumbnail: d.thumbnailUrl || null,
    }
  }
  return null
}

async function oembedInfo(videoId) {
  const res = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}&format=json`,
    { signal: AbortSignal.timeout(5000) }
  )
  if (!res.ok) return null
  const data = await res.json()
  return {
    title: data.title || 'Unknown',
    author: data.author_name || 'Unknown',
    duration: '0',
    audioUrl: null,
    thumbnail: data.thumbnail_url || null,
  }
}

async function innerTubeInfo(videoId) {
  for (const client of INNERTUBE_CLIENTS) {
    for (const key of INNERTUBE_KEYS) {
      try {
        const body = { videoId, context: { client } }
        const res = await fetch('https://www.youtube.com/youtubei/v1/player?key=' + key, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(4000),
        })
        if (!res.ok) continue
        const data = await res.json()
        const ps = data?.playabilityStatus
        if (ps?.status && ps.status !== 'OK') continue
        const sd = data?.streamingData
        if (!sd) continue
        const all = [...(sd.formats || []), ...(sd.adaptiveFormats || [])]
        const audio = all.filter(f => f.mimeType?.startsWith('audio/') && f.url).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
        if (!audio[0]) continue
        const v = data?.videoDetails || {}
        return {
          title: v.title || 'Unknown',
          author: v.author || v.channelOwnerName || 'Unknown',
          duration: v.lengthSeconds || '0',
          audioUrl: audio[0].url,
          thumbnail: v.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || null,
        }
      } catch {}
    }
  }
  return null
}

async function handleInfo(videoUrl, key) {
  const videoId = extractVideoId(videoUrl)
  if (!videoId) return scrapeError('invalid_url', 'Invalid YouTube URL', 400)

  const cached = getCache(_infoCache, videoId)
  if (cached) return scrapeResponse(cached)

  let result = null
  try { result = await pipedInfo(videoId) } catch {}
  if (!result) {
    try { result = await innerTubeInfo(videoId) } catch (e) {
      scrapeLog('youtube', 'innertube_failed', { videoId, err: e?.message })
    }
  }
  if (!result && key) {
    try { result = await apiVideoInfo(videoId, key) } catch (e) {
      scrapeLog('youtube', 'api_info_failed', { videoId, err: e?.message })
    }
  }
  if (!result) {
    try { result = await oembedInfo(videoId) } catch (e) {
      scrapeLog('youtube', 'oembed_failed', { videoId, err: e?.message })
    }
  }

  if (result) {
    setCache(_infoCache, videoId, result, 30000)
    return scrapeResponse(result)
  }
  scrapeLog('youtube', 'info_no_data', { videoId })
  return scrapeError('source_unavailable', 'Could not retrieve video info', 502)
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

  try {
    const { action, query, url } = await context.request.json()
    if (action === 'search') return await handleSearch(query, key)
    if (action === 'info') return await handleInfo(url, key)
    return scrapeError('invalid_action', 'Invalid action', 400)
  } catch (err) {
    scrapeLog('youtube', 'error', { message: err.message?.substring(0, 200) })
    return scrapeError('internal_error', err.message, 500)
  }
}
