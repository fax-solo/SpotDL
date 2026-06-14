const CLIENT_ID = process.env.JAMENDO_CLIENT_ID
const BASE = 'https://api.jamendo.com/v3.0'

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

async function handleSearch(query) {
  if (!CLIENT_ID) {
    return { statusCode: 200, body: JSON.stringify({ results: [], notice: 'Jamendo API key not configured. Set JAMENDO_CLIENT_ID env var.' }) }
  }

  const res = await fetch(
    `${BASE}/tracks/?client_id=${CLIENT_ID}&format=json&limit=5&search=${encodeURIComponent(query)}&include=musicinfo`,
    { headers: { 'Accept': 'application/json' } }
  )
  if (!res.ok) {
    return { statusCode: 200, body: JSON.stringify({ results: [] }) }
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

  return { statusCode: 200, body: JSON.stringify({ results }) }
}

async function handleInfo(trackId) {
  if (!CLIENT_ID) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Jamendo API key not configured' }) }
  }

  const res = await fetch(
    `${BASE}/tracks/?client_id=${CLIENT_ID}&format=json&id=${trackId}&include=musicinfo`,
    { headers: { 'Accept': 'application/json' } }
  )
  if (!res.ok) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Jamendo API error' }) }
  }
  const data = await res.json()
  const track = data?.results?.[0]
  if (!track) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Track not found' }) }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      title: track.name,
      author: track.artist_name,
      duration: String(track.duration || 0),
      audioUrl: track.audio,
      thumbnail: track.image || track.album_image || null,
    }),
  }
}
