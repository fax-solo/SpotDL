import { checkRateLimit } from './_lib/rate_limit'

// @deprecated Audio streaming proxy for the legacy web frontend. New clients
// should download via the FastAPI backend (POST /api/resolve-audio), which
// returns direct audio URLs without edge proxying.

const DEFAULT_CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Range', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type' }

const ALLOWED_HOSTS = [
  'rr1.googlevideo.com',
  'rr2.googlevideo.com',
  'rr3.googlevideo.com',
  'rr4.googlevideo.com',
  'rr5.googlevideo.com',
  'rr6.googlevideo.com',
  'rr7.googlevideo.com',
  'rr8.googlevideo.com',
  'rr9.googlevideo.com',
  'rr10.googlevideo.com',
  'rr11.googlevideo.com',
  'rr12.googlevideo.com',
  'lh3.googleusercontent.com',
  'pipedapi.kavin.rocks',
  'i.ytimg.com',
  'is1-ssl.mzstatic.com',
  'mosaic.scdn.co',
  'i.scdn.co',
  'image-cdn-ak.spotifycdn.com',
  'image-cdn-fa.spotifycdn.com',
]

function isAllowedUrl(urlStr) {
  try {
    const u = new URL(urlStr)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    // Block private / internal IP ranges
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]') return false
    if (/^10\.\d+\.\d+\.\d+$/.test(host) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host) || /^192\.168\.\d+\.\d+$/.test(host)) return false
    if (/^169\.254\.\d+\.\d+$/.test(host)) return false
    if (/\s/.test(host)) return false
    if (host.includes('..')) return false
    return ALLOWED_HOSTS.includes(host)
  } catch {
    return false
  }
}

function getAllowedOrigins(env) {
  return env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) : []
}
function normalizeOrigin(o) {
  const s = o.trim()
  if (s.startsWith('https://') || s.startsWith('http://')) return s
  return 'https://' + s
}
function getCors(context) {
  const requestOrigin = context.request.headers.get('Origin') || ''
  const allowed = getAllowedOrigins(context.env)
  const corsOrigin = allowed.length > 0
    ? (allowed.some(a => requestOrigin === normalizeOrigin(a)) ? requestOrigin : '')
    : '*'
  const headers = { ...DEFAULT_CORS, 'Vary': 'Origin' }
  if (corsOrigin) headers['Access-Control-Allow-Origin'] = corsOrigin
  else delete headers['Access-Control-Allow-Origin']
  return headers
}

export async function onRequest(context) {
  const cors = getCors(context)

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }
  if (context.request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: cors })
  }

  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown'
  const { allowed } = await checkRateLimit(context.env.DB, `source:proxy:${ip}`, 120)
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests. Try again later.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...cors },
    })
  }

  const reqUrl = new URL(context.request.url)
  const targetUrl = reqUrl.searchParams.get('url')
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    })
  }

  let decodedUrl
  try {
    decodedUrl = decodeURIComponent(targetUrl)
    new URL(decodedUrl)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid URL' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    })
  }

  if (!isAllowedUrl(decodedUrl)) {
    return new Response(JSON.stringify({ error: 'URL not allowed' }), {
      status: 403, headers: { 'Content-Type': 'application/json', ...cors },
    })
  }

  try {
    const upstreamHost = new URL(decodedUrl).hostname.toLowerCase()
    const referer = upstreamHost.includes('googlevideo') || upstreamHost.includes('ytimg')
      ? 'https://www.youtube.com/'
      : upstreamHost.includes('mzstatic')
        ? 'https://music.apple.com/'
        : upstreamHost.includes('scdn')
          ? 'https://open.spotify.com/'
          : ''
    const upstream = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer,
        'Range': context.request.headers.get('Range') || '',
      },
      signal: AbortSignal.timeout(30000),
    })

    const responseHeaders = new Headers(cors)
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const val = upstream.headers.get(h)
      if (val) responseHeaders.set(h, val)
    }

    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy failed' }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...cors },
    })
  }
}
