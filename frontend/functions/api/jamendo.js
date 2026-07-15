import { checkRateLimit } from './_lib/rate_limit'

const BASE = 'https://api.jamendo.com/v3.0'

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown'
  const { allowed } = await checkRateLimit(context.env.DB, `source:jamendo:${ip}`, 30)
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests. Try again later.', error_type: 'rate_limited' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { action, query, url } = await context.request.json()

    if (action === 'search') return await handleSearch(context, query)
    if (action === 'info') return await handleInfo(context, url)
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function handleSearch(context, query) {
  const CLIENT_ID = context.env.JAMENDO_CLIENT_ID

  if (!CLIENT_ID) {
    return new Response(JSON.stringify({ results: [], notice: 'Jamendo API key not configured. Set JAMENDO_CLIENT_ID env var.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const res = await fetch(
    `${BASE}/tracks/?client_id=${CLIENT_ID}&format=json&limit=5&search=${encodeURIComponent(query)}&include=musicinfo`,
    { headers: { 'Accept': 'application/json' } }
  )
  if (!res.ok) {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const data = await res.json()
  const tracks = data?.results || []

  const results = tracks.map(track => ({
    url: track.id,
    title: track.name,
    artist: track.artist_name || 'Unknown',
    duration: String(track.duration || 0),
    audioUrl: track.audio,
    thumbnail: track.image || track.album_image || null,
    source: 'jamendo',
  }))

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function handleInfo(context, trackId) {
  const CLIENT_ID = context.env.JAMENDO_CLIENT_ID

  if (!CLIENT_ID) {
    return new Response(JSON.stringify({ error: 'Jamendo API key not configured' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const res = await fetch(
    `${BASE}/tracks/?client_id=${CLIENT_ID}&format=json&id=${trackId}&include=musicinfo`,
    { headers: { 'Accept': 'application/json' } }
  )
  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'Jamendo API error' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const data = await res.json()
  const track = data?.results?.[0]
  if (!track) {
    return new Response(JSON.stringify({ error: 'Track not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    title: track.name,
    author: track.artist_name,
    duration: String(track.duration || 0),
    audioUrl: track.audio,
    thumbnail: track.image || track.album_image || null,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
