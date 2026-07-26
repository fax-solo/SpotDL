import { checkRateLimit } from './_lib/rate_limit'

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

  return json({ detail: 'Server download unavailable — use client-side mode' }, 503)
}
