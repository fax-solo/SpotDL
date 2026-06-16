// functions/api/proxy.js
// Proxies audio/video streams so Capacitor WebView (capacitor://localhost)
// can download YouTube audio that has CORS restrictions.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type',
}

const ALLOWED_HOSTS = [
  'rr',           // YouTube CDN (rr*.googlevideo.com)
  'googlevideo',
  'lh3.google',
  'pipedapi',
  'piped.kavin',
  'i.ytimg',
  'is1-ssl.mzstatic', // Apple Music artwork
  'mosaic.scdn.co',   // Spotify artwork
  'i.scdn.co',
]

function isAllowedUrl(urlStr) {
  try {
    const u = new URL(urlStr)
    return ALLOWED_HOSTS.some(h => u.hostname.includes(h))
  } catch {
    return false
  }
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (context.request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS })
  }

  const reqUrl = new URL(context.request.url)
  const targetUrl = reqUrl.searchParams.get('url')

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  let decodedUrl
  try {
    decodedUrl = decodeURIComponent(targetUrl)
    new URL(decodedUrl) // validate
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  if (!isAllowedUrl(decodedUrl)) {
    return new Response(JSON.stringify({ error: 'URL not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...CORS },
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

    const responseHeaders = new Headers(CORS)
    const passthroughHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges']
    for (const h of passthroughHeaders) {
      const val = upstream.headers.get(h)
      if (val) responseHeaders.set(h, val)
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
}
