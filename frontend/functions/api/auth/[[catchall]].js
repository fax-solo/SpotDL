const API_BASE = typeof API_URL !== 'undefined' ? API_URL : ''

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const path = url.pathname

  const apiUrl = env.API_URL || API_BASE || 'http://localhost:8000'
  const targetUrl = `${apiUrl}${path}${url.search}`

  const headers = new Headers(request.headers)
  headers.set('Host', new URL(apiUrl).hostname)

  const init = {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined,
  }

  try {
    const upstream = await fetch(targetUrl, init)
    const responseHeaders = new Headers(upstream.headers)
    responseHeaders.set('Access-Control-Allow-Origin', '*')
    responseHeaders.set('Access-Control-Allow-Methods', '*')
    responseHeaders.set('Access-Control-Allow-Headers', '*')

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Backend unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  })
}
