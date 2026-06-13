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

  if (results.length === 0) {
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

  const result = await tryGetStreamingData(videoId)

  if (result.streamingData) {
    const allFormats = [
      ...(result.streamingData.formats || []),
      ...(result.streamingData.adaptiveFormats || []),
    ]

    const audioFormats = allFormats
      .filter(f => f.mimeType && f.mimeType.startsWith('audio/') && f.url)
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))

    const bestFormat = audioFormats[0] || null

    return {
      statusCode: 200,
      body: JSON.stringify({
        title: result.videoDetails?.title || 'Unknown',
        author: result.videoDetails?.author || result.videoDetails?.channelOwnerName || 'Unknown',
        duration: result.videoDetails?.lengthSeconds || '0',
        audioUrl: bestFormat?.url || null,
        thumbnail: result.videoDetails?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || null,
      }),
    }
  }

  return {
    statusCode: 502,
    body: JSON.stringify({
      error: 'No streaming data',
      playability: result.playabilityStatus?.status || 'unknown',
      reason: result.playabilityStatus?.reason || 'Unknown error',
    }),
  }
}

async function tryGetStreamingData(videoId) {
  // Try 1: Video page HTML
  try {
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`
    const res = await fetch(pageUrl, {
      headers: { ...COMMON_HEADERS, 'Accept': 'text/html' },
    })
    const html = await res.text()
    const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});\s*(?:<\/script>|var)/)
    if (match) {
      const data = JSON.parse(match[1])
      if (data?.streamingData) return data
      return { streamingData: null, playabilityStatus: data?.playabilityStatus, videoDetails: data?.videoDetails }
    }
  } catch {}

  // Try 2: Innertube API with WEB client
  try {
    const payload = {
      context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' } },
      videoId,
    }
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...COMMON_HEADERS },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (data?.streamingData) return data
    return { streamingData: null, playabilityStatus: data?.playabilityStatus, videoDetails: data?.videoDetails }
  } catch {}

  // Try 3: get_video_info endpoint
  try {
    const res = await fetch(`https://www.youtube.com/get_video_info?video_id=${videoId}&eurl=https://youtube.googleapis.com/v/${videoId}&html5=1`, {
      headers: COMMON_HEADERS,
    })
    const text = await res.text()
    const params = new URLSearchParams(text)
    const playerResponse = params.get('player_response')
    if (playerResponse) {
      const data = JSON.parse(decodeURIComponent(playerResponse))
      if (data?.streamingData) return data
      return { streamingData: null, playabilityStatus: data?.playabilityStatus, videoDetails: data?.videoDetails }
    }
  } catch {}

  return { streamingData: null }
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
