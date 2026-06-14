const CLIENTS = [
  { name: 'ANDROID_v1', context: { client: { clientName: 'ANDROID', clientVersion: '18.37.36', androidSdkVersion: 30, osName: 'Android', osVersion: '13', platform: 'MOBILE', gl: 'US', hl: 'en' } } },
  { name: 'ANDROID_v2', context: { client: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, osName: 'Android', osVersion: '13', platform: 'MOBILE', gl: 'US', hl: 'en' } } },
  { name: 'ANDROID_MUSIC', context: { client: { clientName: 'ANDROID_MUSIC', clientVersion: '6.27.52', androidSdkVersion: 30, osName: 'Android', osVersion: '13', platform: 'MOBILE', gl: 'US', hl: 'en' } } },
  { name: 'TV', context: { client: { clientName: 'TVHTML5', clientVersion: '7.20240101.00.00', gl: 'US', hl: 'en' } } },
  { name: 'WEB_REMIX', context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', gl: 'US', hl: 'en' } } },
  { name: 'WEB', context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', gl: 'US', hl: 'en' } } },
]

const KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'
const COOKIES = 'CONSENT=YES+; SOCS=CAISHAgCEhJqOHNfVUJfMl9xMHpKNHBpM1cYAiIBBiA='

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
  for (const c of CLIENTS) {
    try {
      const res = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': COOKIES, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
        body: JSON.stringify({ context: c.context, query }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) continue
      const data = await res.json()
      const results = []
      const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || []
      for (const section of sections) {
        for (const item of (section?.itemSectionRenderer?.contents || [])) {
          const r = item?.videoRenderer
          if (!r?.videoId) continue
          results.push({ videoId: r.videoId, title: r.title?.runs?.[0]?.text || 'Unknown', url: `https://youtube.com/watch?v=${r.videoId}` })
          if (results.length >= 5) break
        }
        if (results.length >= 5) break
      }
      if (results.length > 0) return { statusCode: 200, body: JSON.stringify({ results }) }
    } catch {}
  }
  return { statusCode: 200, body: JSON.stringify({ results: [] }) }
}

async function handleInfo(videoUrl) {
  const videoId = extractVideoId(videoUrl)
  if (!videoId) return { statusCode: 400, body: JSON.stringify({ error: 'Invalid YouTube URL' }) }

  for (const c of CLIENTS) {
    try {
      const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': COOKIES, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
        body: JSON.stringify({ context: c.context, videoId }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) continue
      const data = await res.json()
      const ps = data?.playabilityStatus
      if (ps?.status && ps.status !== 'OK') continue
      const result = extractAudio(data)
      if (result) return { statusCode: 200, body: JSON.stringify(result) }
    } catch {}
  }

  return { statusCode: 502, body: JSON.stringify({ error: 'Could not retrieve audio from any source' }) }
}

function extractAudio(data) {
  const sd = data?.streamingData
  if (!sd) return null
  const all = [...(sd.formats || []), ...(sd.adaptiveFormats || [])]
  const audio = all.filter(f => f.mimeType?.startsWith('audio/') && f.url).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
  if (!audio[0]) return null
  const v = data?.videoDetails || {}
  return { title: v.title || 'Unknown', author: v.author || v.channelOwnerName || 'Unknown', duration: v.lengthSeconds || '0', audioUrl: audio[0].url, thumbnail: v.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || null }
}

function extractVideoId(url) {
  const patterns = [/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/, /youtu\.be\/([a-zA-Z0-9_-]{11})/, /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/, /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/]
  for (const p of patterns) { const m = p.exec(url); if (m) return m[1] }
  return null
}
