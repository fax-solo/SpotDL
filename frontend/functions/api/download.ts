import { checkRateLimit } from './_lib/rate_limit'

const RENDER_API = 'https://sinc-api.onrender.com'

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const onRequest: PagesFunction = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown'
  const { allowed } = await checkRateLimit(context.env.DB, `download:${ip}`, 20)
  if (!allowed) {
    return json({ detail: 'Too many requests. Try again later.' }, 429)
  }

  try {
    const body = await context.request.json()
    const upstream = await fetch(`${RENDER_API}/api/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({ detail: upstream.statusText }))
      return json(err, upstream.status)
    }

    const responseHeaders = new Headers(upstream.headers)
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  } catch (err) {
    return json({ detail: 'Download service unavailable' }, 502)
  }
}
