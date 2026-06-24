const DEEZER_API = 'https://api.deezer.com'

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { action, query, id } = await context.request.json()

    if (action === 'search') return await handleSearch(query)
    if (action === 'track') return await handleTrack(id)
    if (action === 'isrc') return await handleIsrc(query)
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

async function handleSearch(query) {
  const res = await fetch(
    `${DEEZER_API}/search?q=${encodeURIComponent(query)}&limit=10&order=RANKING`,
    { headers: { 'Accept': 'application/json' } },
  )
  if (!res.ok) {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const data = await res.json()
  const tracks = data?.data || []

  const results = tracks.map(t => ({
    id: t.id,
    title: t.title || 'Unknown',
    artist: t.artist?.name || 'Unknown',
    album: t.album?.title || 'Unknown',
    duration: String(t.duration || 0),
    isrc: t.isrc || null,
    thumbnail: t.album?.cover_big || t.album?.cover_medium || null,
    preview: t.preview || null,
    source: 'deezer',
  }))

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function handleTrack(id) {
  const res = await fetch(`${DEEZER_API}/track/${id}`, {
    headers: { 'Accept': 'application/json' },
  })
  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'Track not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const t = await res.json()

  return new Response(JSON.stringify({
    id: t.id,
    title: t.title,
    artist: t.artist?.name,
    album: t.album?.title,
    duration: String(t.duration || 0),
    isrc: t.isrc || null,
    thumbnail: t.album?.cover_big || null,
    preview: t.preview || null,
    source: 'deezer',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function handleIsrc(isrc) {
  const res = await fetch(
    `${DEEZER_API}/search?q=isrc:${encodeURIComponent(isrc)}`,
    { headers: { 'Accept': 'application/json' } },
  )
  if (!res.ok) {
    return new Response(JSON.stringify({ track: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const data = await res.json()
  const track = data?.data?.[0] || null

  if (!track) {
    return new Response(JSON.stringify({ track: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    track: {
      id: track.id,
      title: track.title,
      artist: track.artist?.name,
      album: track.album?.title,
      duration: String(track.duration || 0),
      isrc: track.isrc || null,
      thumbnail: track.album?.cover_big || null,
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
