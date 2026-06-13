const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
}

const CLIENTS = [
  {
    name: 'ANDROID',
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '19.09.37',
        androidSdkVersion: 30,
      },
    },
  },
  {
    name: 'ANDROID_MUSIC',
    context: {
      client: {
        clientName: 'ANDROID_MUSIC',
        clientVersion: '6.27.52',
        androidSdkVersion: 30,
      },
    },
  },
  {
    name: 'WEB',
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20240101.00.00',
      },
    },
  },
]

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
  for (const client of CLIENTS) {
    try {
      const payload = { context: client.context, query }
      const res = await fetch('https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...COMMON_HEADERS },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      const results = []
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
      if (results.length > 0) {
        return { statusCode: 200, body: JSON.stringify({ results }) }
      }
    } catch {}
  }

  return { statusCode: 200, body: JSON.stringify({ results: [] }) }
}

async function handleInfo(videoUrl) {
  const videoId = extractVideoId(videoUrl)
  if (!videoId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid YouTube URL' }) }
  }

  for (const client of CLIENTS) {
    try {
      const payload = { context: client.context, videoId }
      const res = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...COMMON_HEADERS },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      const streamingData = data?.streamingData
      if (streamingData) {
        const allFormats = [
          ...(streamingData.formats || []),
          ...(streamingData.adaptiveFormats || []),
        ]
        const audioFormats = allFormats
          .filter(f => f.mimeType && f.mimeType.startsWith('audio/') && f.url)
          .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
        const bestFormat = audioFormats[0] || null
        const videoDetails = data?.videoDetails || {}

        if (bestFormat) {
          return {
            statusCode: 200,
            body: JSON.stringify({
              title: videoDetails.title || 'Unknown',
              author: videoDetails.author || videoDetails.channelOwnerName || 'Unknown',
              duration: videoDetails.lengthSeconds || '0',
              audioUrl: bestFormat.url,
              thumbnail: videoDetails.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || null,
            }),
          }
        }
      }
    } catch {}
  }

  return {
    statusCode: 502,
    body: JSON.stringify({ error: 'Could not retrieve audio from any YouTube client' }),
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
