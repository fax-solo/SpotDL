const ytdl = require('@distube/ytdl-core')

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
  const res = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })

  const html = await res.text()

  const results = []
  const regex = /"videoRenderer":\{"videoId":"([^"]+)".*?"title":\{"runs":\[{"text":"([^"]+)"/
  let match

  const re = new RegExp(regex.source, 'g')
  while ((match = re.exec(html)) !== null) {
    const videoId = match[1]
    const title = match[2].replace(/\\"/g, '"')
    if (!results.find(r => r.videoId === videoId)) {
      results.push({ videoId, title, url: `https://youtube.com/watch?v=${videoId}` })
    }
    if (results.length >= 5) break
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ results }),
  }
}

async function handleInfo(url) {
  const info = await ytdl.getInfo(url, {
    requestOptions: {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      },
    },
  })

  const audioFormats = ytdl.filterFormats(info.formats, 'audioonly')

  const bestFormat = audioFormats
    .filter(f => f.url)
    .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))[0]

  return {
    statusCode: 200,
    body: JSON.stringify({
      title: info.videoDetails.title,
      author: info.videoDetails.author?.name || info.videoDetails.ownerChannelName,
      duration: info.videoDetails.lengthSeconds,
      audioUrl: bestFormat?.url || null,
      thumbnail: info.videoDetails.thumbnails?.sort((a, b) => b.width - a.width)?.[0]?.url || null,
    }),
  }
}
