import { checkRateLimit } from './_lib/rate_limit'

const DEFAULT_CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Range', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type' }

const ALLOWED_HOST_SUFFIXES = [
  '.googlevideo.com',
  'rr',
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
    const host = u.hostname.toLowerCase()
    return ALLOWED_HOST_SUFFIXES.some(h => {
      if (h === 'rr') return /^rr\d*--?[a-z]+\.googlevideo\.com$/.test(host)
      return host === h || host.endsWith('.' + h)
    })
  } catch {
    return false
  }
}

function getCors(context) {
  const allowedOrigin = context.env.ALLOWED_ORIGINS || '*'
  return { ...DEFAULT_CORS, 'Access-Control-Allow-Origin': allowedOrigin }
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
    const upstream = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.youtube.com/',
        'Range': context.request.headers.get('Range') || 'bytes=0-',
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
