const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
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

  if (results.length === 0) {
    const jsonMatch = html.match(/ytInitialData\s*=\s*({.+?});\s*<\/script>/)
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1])
        const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || []
        for (const section of sections) {
          const items = section?.itemSectionRenderer?.contents || []
          for (const item of items) {
            const r = item?.videoRenderer
            if (!r?.videoId) continue
            results.push({
              videoId: r.videoId,
              title: r.title?.runs?.[0]?.text || 'Unknown',
              url: `https://youtube.com/watch?v=${r.videoId}`,
            })
            if (results.length >= 5) break
          }
          if (results.length >= 5) break
        }
      } catch {}
    }
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

  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`
  const res = await fetch(pageUrl, {
    headers: {
      ...COMMON_HEADERS,
      'Accept': 'text/html,application/xhtml+xml',
    },
  })

  if (!res.ok) {
    return { statusCode: 502, body: JSON.stringify({ error: `YouTube page returned ${res.status}` }) }
  }

  const html = await res.text()

  const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});\s*(?:<\/script>|var)/)
  if (!match) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Could not find player response' }) }
  }

  let data
  try {
    data = JSON.parse(match[1])
  } catch {
    return { statusCode: 502, body: JSON.stringify({ error: 'Failed to parse player response' }) }
  }

  const streamingData = data?.streamingData
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

  const videoDetails = data?.videoDetails || {}

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
