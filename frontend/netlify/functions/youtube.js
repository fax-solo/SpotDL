const API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
}

const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'WEB',
    clientVersion: '2.20240101.00.00',
  },
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const { action, query, url } = JSON.parse(event.body)

    if (action === 'search') {
      return await handleSearch(query)
    }

    if (action === 'info') {
      return await handleInfo(url)
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action' }) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

async function handleSearch(query) {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
  const res = await fetch(searchUrl, { headers: COMMON_HEADERS })
  const html = await res.text()

  const results = []
  const regex = /"videoRenderer":\{"videoId":"([^"]+)"[^}]*?"title":\{"runs":\[{"text":"([^"]+)"[^}]*?\}\][^}]*?\}[^}]*?\}/g
  let match

  while ((match = regex.exec(html)) !== null) {
    const videoId = match[1]
    const title = match[2].replace(/\\u0026/g, '&').replace(/\\"/g, '"').replace(/\\/g, '')
    if (!results.some(r => r.videoId === videoId)) {
      results.push({ videoId, title, url: `https://youtube.com/watch?v=${videoId}` })
    }
    if (results.length >= 5) break
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ results }),
  }
}

async function handleInfo(videoUrl) {
  const videoId = extractVideoId(videoUrl)
  if (!videoId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid YouTube URL' }) }
  }

  const payload = {
    context: INNERTUBE_CONTEXT,
    videoId,
  }

  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...COMMON_HEADERS },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    return { statusCode: 502, body: JSON.stringify({ error: `YouTube API returned ${res.status}` }) }
  }

  const data = await res.json()
  const streamingData = data.streamingData

  if (!streamingData) {
    return { statusCode: 502, body: JSON.stringify({ error: 'No streaming data available' }) }
  }

  const allFormats = [
    ...(streamingData.formats || []),
    ...(streamingData.adaptiveFormats || []),
  ]

  const audioFormats = allFormats
    .filter(f => f.mimeType && f.mimeType.startsWith('audio/') && f.url)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))

  const bestFormat = audioFormats[0] || null

  const videoDetails = data.videoDetails || {}

  return {
    statusCode: 200,
    body: JSON.stringify({
      title: videoDetails.title || 'Unknown',
      author: videoDetails.author || videoDetails.channelOwnerName || 'Unknown',
      duration: videoDetails.lengthSeconds || '0',
      audioUrl: bestFormat?.url || null,
      thumbnail: videoDetails.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || null,
    }),
  }
}

function extractVideoId(url) {
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const m = pattern.exec(url)
    if (m) return m[1]
  }
  return null
}
