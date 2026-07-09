import { fetchWithRetry, scrapeResponse, scrapeError } from './_lib/retry.js'
import { scrapeLog, errorType } from './_lib/log.js'

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
const HEADERS = { 'User-Agent': BROWSER_UA }

let _clientIdCache = null
let _clientIdExpires = 0
const CLIENT_ID_TTL = 15 * 60 * 1000

async function scrapeClientId() {
  const res = await fetch('https://soundcloud.com/', { headers: HEADERS, signal: AbortSignal.timeout(10000) })
  const html = await res.text()
  const primary = html.match(/"apiClient","data":\{"id":"([^"]+)"/)
  if (primary) return primary[1]
  const fallback = html.match(/client_id["\s:=]+"([a-f0-9]+)"/i)
  if (fallback) return fallback[1]
  return null
}

async function getClientId() {
  const now = Date.now()
  if (_clientIdCache && now < _clientIdExpires) return _clientIdCache
  const cid = await scrapeClientId()
  if (cid) {
    _clientIdCache = cid
    _clientIdExpires = Date.now() + CLIENT_ID_TTL
    scrapeLog('soundcloud', 'client_id_refreshed')
    return cid
  }
  return _clientIdCache || null
}

function invalidateClientId() {
  _clientIdCache = null
  _clientIdExpires = 0
}

async function fetchWithCid(url, cid, retryOnAuth = true) {
  const fullUrl = url.includes('?') ? `${url}&client_id=${cid}` : `${url}?client_id=${cid}`
  try {
    const res = await fetchWithRetry(fullUrl, { headers: HEADERS }, {
      retries: 2,
      baseDelay: 1000,
      timeout: 10000,
      onRetry: ({ attempt, status, delay }) => {
        scrapeLog('soundcloud', 'retry', { url: fullUrl.slice(0, 100), attempt, status, delay })
      },
    })
    return res
  } catch (err) {
    if (retryOnAuth && err instanceof Response && (err.status === 401 || err.status === 403)) {
      scrapeLog('soundcloud', 'auth_error_refetching_client_id', { status: err.status })
      invalidateClientId()
      const newCid = await getClientId()
      if (newCid && newCid !== cid) {
        return fetchWithCid(url, newCid, false)
      }
    }
    throw err
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { action, query, url } = await context.request.json()

    if (action === 'search') return await handleSearch(query)
    if (action === 'info') return await handleInfo(url)
    return scrapeError('invalid_action', 'Invalid action', 400)
  } catch (err) {
    scrapeLog('soundcloud', 'error', { message: err.message })
    return scrapeError('internal_error', err.message, 500)
  }
}

async function handleSearch(query) {
  const cid = await getClientId()
  if (!cid) {
    scrapeLog('soundcloud', 'search_no_client_id')
    return scrapeError('source_unavailable', 'Failed to get SoundCloud client ID', 502)
  }

  try {
    const apiUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&limit=5`
    const res = await fetchWithCid(apiUrl, cid)

    if (!res.ok) {
      const et = errorType(res.status, 'SoundCloud')
      scrapeLog('soundcloud', 'search_failed', { query, status: res.status, error_type: et.type })
      return scrapeError(et.type, et.message, res.status === 429 ? 429 : 502)
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

    scrapeLog('soundcloud', 'search_ok', { query, results: results.length })
    return scrapeResponse({ results })
  } catch (err) {
    if (err instanceof Response) {
      const et = errorType(err.status, 'SoundCloud')
      scrapeLog('soundcloud', 'search_error', { query, status: err.status })
      return scrapeError(et.type, et.message, err.status === 429 ? 429 : 502)
    }
    scrapeLog('soundcloud', 'search_exception', { query, message: err.message })
    return scrapeError('source_unavailable', 'SoundCloud search failed', 502)
  }
}

async function handleInfo(trackUrl) {
  const pathMatch = trackUrl.match(/soundcloud\.com(\/[^?#]+)/)
  if (!pathMatch) {
    return scrapeError('invalid_url', 'Invalid SoundCloud URL', 400)
  }

  const path = pathMatch[1].replace(/\/$/, '')
  const cid = await getClientId()
  if (!cid) {
    scrapeLog('soundcloud', 'info_no_client_id')
    return scrapeError('source_unavailable', 'Failed to get SoundCloud client ID', 502)
  }

  try {
    const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=https://soundcloud.com${encodeURIComponent(path)}`
    const res = await fetchWithCid(resolveUrl, cid)

    if (!res.ok) {
      const et = errorType(res.status, 'SoundCloud')
      scrapeLog('soundcloud', 'resolve_failed', { path, status: res.status, error_type: et.type })
      return scrapeError(et.type, et.message, res.status === 429 ? 429 : 502)
    }

    const track = await res.json()

    let audioUrl = null

    if (track.downloadable && track.download_url) {
      try {
        const dlRes = await fetch(`${track.download_url}?client_id=${cid}`, {
          headers: HEADERS,
          redirect: 'manual',
          signal: AbortSignal.timeout(10000),
        })
        if (dlRes.status >= 300 && dlRes.status < 400) {
          audioUrl = dlRes.headers.get('location')
        }
      } catch {}
    }

    if (!audioUrl && track.media?.transcodings) {
      const transcodings = track.media.transcodings
      const preferred = transcodings.find(
        t => t.format?.protocol === 'progressive' && t.format?.mime_type?.startsWith('audio/mpeg'),
      ) || transcodings.find(
        t => t.format?.protocol === 'progressive',
      ) || transcodings[0]

      if (preferred) {
        try {
          const streamRes = await fetch(`${preferred.url}?client_id=${cid}`, {
            headers: HEADERS,
            signal: AbortSignal.timeout(10000),
          })
          if (streamRes.ok) {
            const streamData = await streamRes.json()
            audioUrl = streamData?.url || null
          }
        } catch {}
      }
    }

    scrapeLog('soundcloud', 'info_ok', { path, has_audio: !!audioUrl })
    return scrapeResponse({
      title: track.title || 'Unknown',
      author: track.user?.username || 'Unknown',
      duration: String(Math.floor((track.duration || 0) / 1000)),
      audioUrl,
      thumbnail: track.artwork_url?.replace('-large.', '-t500x500.') || null,
    })
  } catch (err) {
    if (err instanceof Response) {
      const et = errorType(err.status, 'SoundCloud')
      scrapeLog('soundcloud', 'info_error', { path, status: err.status })
      return scrapeError(et.type, et.message, err.status === 429 ? 429 : 502)
    }
    scrapeLog('soundcloud', 'info_exception', { path, message: err.message })
    return scrapeError('source_unavailable', 'SoundCloud info failed', 502)
  }
}
