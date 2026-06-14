const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  try {
    const { action, query, url } = JSON.parse(event.body)

    if (action === 'search') return await handleSearch(query)
    if (action === 'info') return await handleInfo(url)
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action' }) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
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
  if (!cid) return { statusCode: 200, body: JSON.stringify({ results: [] }) }

  const res = await fetch(
    `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${cid}&limit=5`,
    { headers: HEADERS },
  )
  if (!res.ok) return { statusCode: 200, body: JSON.stringify({ results: [] }) }

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

  return { statusCode: 200, body: JSON.stringify({ results }) }
}

async function handleInfo(trackUrl) {
  // Extract the soundcloud path from the URL
  const pathMatch = trackUrl.match(/soundcloud\.com(\/[^?#]+)/)
  if (!pathMatch) return { statusCode: 400, body: JSON.stringify({ error: 'Invalid SoundCloud URL' }) }

  const path = pathMatch[1].replace(/\/$/, '')
  const cid = await getClientId()
  if (!cid) return { statusCode: 502, body: JSON.stringify({ error: 'Failed to get SoundCloud client ID' }) }

  // Resolve the track URL to get the API data
  const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=https://soundcloud.com${path}&client_id=${cid}`
  const res = await fetch(resolveUrl, { headers: HEADERS })

  if (!res.ok) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Track not found' }) }
  }

  const track = await res.json()

  // Try to get audio URL
  let audioUrl = null

  // Option 1: Download URL (for downloadable tracks)
  if (track.downloadable && track.download_url) {
    const dlRes = await fetch(`${track.download_url}?client_id=${cid}`, {
      headers: HEADERS,
      redirect: 'manual',
    })
    if (dlRes.status >= 300 && dlRes.status < 400) {
      audioUrl = dlRes.headers.get('location')
    }
  }

  // Option 2: Stream URL via transcodings
  if (!audioUrl && track.media?.transcodings) {
    // Prefer progressive (HTTP) over HLS
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

  return {
    statusCode: 200,
    body: JSON.stringify({
      title: track.title || 'Unknown',
      author: track.user?.username || 'Unknown',
      duration: String(Math.floor((track.duration || 0) / 1000)),
      audioUrl,
      thumbnail: track.artwork_url?.replace('-large.', '-t500x500.') || null,
    }),
  }
}
