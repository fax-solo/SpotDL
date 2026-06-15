const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { action, query, url } = await context.request.json()

    if (action === 'search') return await handleSearch(query)
    if (action === 'info') return await handleInfo(url)
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

async function getClientId() {
  const res = await fetch('https://soundcloud.com/', { headers: HEADERS })
  const html = await res.text()
  const match = html.match(/"apiClient","data":\{"id":"([^"]+)"/)
  if (match) return match[1]
  const fallback = html.match(/client_id["\s:=]+"([a-f0-9]+)"/i)
  if (fallback) return fallback[1]
  return null
}

async function handleSearch(query) {
  const cid = await getClientId()
  if (!cid) {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const res = await fetch(
    `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${cid}&limit=5`,
    { headers: HEADERS },
  )
  if (!res.ok) {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const data = await res.json()
  const tracks = data?.collection || []

  const results = tracks.map(t => ({
    url: t.permalink_url || `https://soundcloud.com/${t.user.permalink}/${t.permalink}`,
    title: t.title || 'Unknown',
    artist: t.user?.username || 'Unknown',
    duration: String(Math.floor((t.duration || 0) / 1000)),
    audioUrl: null,
    thumbnail: t.artwork_url?.replace('-large.', '-t500x500.') || null,
    source: 'soundcloud',
  }))

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function handleInfo(trackUrl) {
  const pathMatch = trackUrl.match(/soundcloud\.com(\/[^?#]+)/)
  if (!pathMatch) {
    return new Response(JSON.stringify({ error: 'Invalid SoundCloud URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const path = pathMatch[1].replace(/\/$/, '')
  const cid = await getClientId()
  if (!cid) {
    return new Response(JSON.stringify({ error: 'Failed to get SoundCloud client ID' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=https://soundcloud.com${path}&client_id=${cid}`
  const res = await fetch(resolveUrl, { headers: HEADERS })

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'Track not found' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const track = await res.json()

  let audioUrl = null

  if (track.downloadable && track.download_url) {
    const dlRes = await fetch(`${track.download_url}?client_id=${cid}`, {
      headers: HEADERS,
      redirect: 'manual',
    })
    if (dlRes.status >= 300 && dlRes.status < 400) {
      audioUrl = dlRes.headers.get('location')
    }
  }

  if (!audioUrl && track.media?.transcodings) {
    const transcodings = track.media.transcodings
    const preferred = transcodings.find(
      t => t.format?.protocol === 'progressive' && t.format?.mime_type?.startsWith('audio/mpeg'),
    ) || transcodings.find(
      t => t.format?.protocol === 'progressive',
    ) || transcodings[0]

    if (preferred) {
      const streamRes = await fetch(`${preferred.url}?client_id=${cid}`, { headers: HEADERS })
      if (streamRes.ok) {
        const streamData = await streamRes.json()
        audioUrl = streamData?.url || null
      }
    }
  }

  return new Response(JSON.stringify({
    title: track.title || 'Unknown',
    author: track.user?.username || 'Unknown',
    duration: String(Math.floor((track.duration || 0) / 1000)),
    audioUrl,
    thumbnail: track.artwork_url?.replace('-large.', '-t500x500.') || null,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
