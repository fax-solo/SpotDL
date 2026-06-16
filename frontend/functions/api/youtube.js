function abortTimeout(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS })
  }
  try {
    const { action, query, url } = await context.request.json()
    if (action === 'search') return await handleSearch(query)
    if (action === 'music-search') return await handleMusicSearch(query)
    if (action === 'info') return await handleInfo(url)
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
}

async function handleSearch(query) {
  for (const c of CLIENTS) {
    try {
      const res = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': COOKIES, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
        body: JSON.stringify({ context: c.context, query }),
        signal: abortTimeout(10000),
      })
      if (!res.ok) continue
      const data = await res.json()
      const results = []
      const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || []
      for (const section of sections) {
        for (const item of (section?.itemSectionRenderer?.contents || [])) {
          const r = item?.videoRenderer
          if (!r?.videoId) continue
          const ownerRuns = r?.ownerText?.runs || r?.longBylineText?.runs || []
          results.push({ videoId: r.videoId, title: r.title?.runs?.[0]?.text || 'Unknown', author: ownerRuns[0]?.text || 'Unknown', url: `https://youtube.com/watch?v=${r.videoId}` })
          if (results.length >= 5) break
        }
        if (results.length >= 5) break
      }
      if (results.length > 0) {
        return new Response(JSON.stringify({ results }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...CORS },
        })
      }
    } catch {}
  }
  return new Response(JSON.stringify({ results: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

async function handleMusicSearch(query) {
  const musicClient = CLIENTS.find(c => c.name === 'WEB_REMIX') || CLIENTS[4]
  try {
    const res = await fetch(`https://music.youtube.com/youtubei/v1/search?key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': COOKIES, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
      body: JSON.stringify({ context: musicClient.context, query }),
      signal: abortTimeout(10000),
    })
    if (!res.ok) {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    const data = await res.json()
    const results = []

    const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs || []
    for (const tab of tabs) {
      const tabRenderer = tab?.tabRenderer
      if (!tabRenderer) continue

      const tabTitle = typeof tabRenderer.title === 'string'
        ? tabRenderer.title
        : tabRenderer.title?.runs?.[0]?.text || ''

      if (tabTitle !== 'Songs') continue

      const sections = tabRenderer?.content?.sectionListRenderer?.contents || []
      for (const section of sections) {
        const shelf = section?.musicShelfRenderer
        if (!shelf) continue

        for (const item of (shelf.contents || [])) {
          const r = item?.musicResponsiveListItemRenderer
          if (!r?.videoId) continue

          const title = r?.flexColumns?.[0]
            ?.musicResponsiveListItemFlexColumnRenderer
            ?.text?.runs?.[0]?.text || 'Unknown'

          const subtitleRuns = r?.flexColumns?.[1]
            ?.musicResponsiveListItemFlexColumnRenderer
            ?.text?.runs || []
          const author = subtitleRuns[0]?.text || 'Unknown'

          const thumbnails = r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || []

          results.push({
            videoId: r.videoId,
            title,
            author,
            url: `https://music.youtube.com/watch?v=${r.videoId}`,
            thumbnail: thumbnails[thumbnails.length - 1]?.url || null,
          })
          if (results.length >= 10) break
        }
        if (results.length >= 10) break
      }
      if (results.length >= 10) break
    }

    if (results.length === 0) {
      for (const c of CLIENTS) {
        try {
          const fallback = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cookie': COOKIES, 'User-Agent': 'Mozilla/5.0' },
            body: JSON.stringify({ context: c.context, query }),
            signal: abortTimeout(10000),
          })
          if (!fallback.ok) continue
          const fbData = await fallback.json()
          const sections = fbData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || []
          for (const section of sections) {
            for (const item of (section?.itemSectionRenderer?.contents || [])) {
              const r = item?.videoRenderer
              if (!r?.videoId) continue
              const ownerRuns = r?.ownerText?.runs || r?.longBylineText?.runs || []
              results.push({
                videoId: r.videoId,
                title: r.title?.runs?.[0]?.text || 'Unknown',
                author: ownerRuns[0]?.text || 'Unknown',
                url: `https://music.youtube.com/watch?v=${r.videoId}`,
                thumbnail: r?.thumbnail?.thumbnails?.[r.thumbnail.thumbnails.length - 1]?.url || null,
              })
              if (results.length >= 10) break
            }
            if (results.length >= 10) break
          }
          if (results.length > 0) break
        } catch {}
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  } catch {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
}

async function handleInfo(videoUrl) {
  const videoId = extractVideoId(videoUrl)
  if (!videoId) {
    return new Response(JSON.stringify({ error: 'Invalid YouTube URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  for (const c of CLIENTS) {
    try {
      const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': COOKIES, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
        body: JSON.stringify({ context: c.context, videoId }),
        signal: abortTimeout(10000),
      })
      if (!res.ok) continue
      const data = await res.json()
      const ps = data?.playabilityStatus
      if (ps?.status && ps.status !== 'OK') continue
      const result = extractAudio(data)
      if (result) {
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...CORS },
        })
      }
    } catch {}
  }

  return new Response(JSON.stringify({ error: 'Could not retrieve audio from any source' }), {
    status: 502,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
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
