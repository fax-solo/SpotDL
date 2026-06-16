const LRCLIB_API = 'https://lrclib.net/api'
const CACHE_TTL = 86400000
const _cache = new Map()

function jsonOk(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function jsonError(msg, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function fetchWithCache(url) {
  const cached = _cache.get(url)
  if (cached && Date.now() < cached.expires) return cached.data
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SpotDL/1.0 (github.com/user/spotdl)', 'Lrclib-Client': 'SpotDL/1.0' },
  })
  if (!res.ok) {
    if (res.status === 404) {
      _cache.set(url, { data: null, expires: Date.now() + CACHE_TTL })
      return null
    }
    throw new Error(`LRCLIB returned ${res.status}`)
  }
  const data = await res.json()
  _cache.set(url, { data, expires: Date.now() + CACHE_TTL })
  if (_cache.size > 200) {
    const now = Date.now()
    for (const [k, v] of _cache) { if (now >= v.expires) _cache.delete(k) }
  }
  return data
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const body = await context.request.json()
    const { trackName, artistName, albumName, duration } = body

    if (!trackName || !artistName) {
      return jsonError('trackName and artistName are required', 400)
    }

    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    })
    if (albumName) params.set('album_name', albumName)

    const data = await fetchWithCache(`${LRCLIB_API}/get?${params}`)

    if (!data && duration) {
      const searchRes = await fetchWithCache(
        `${LRCLIB_API}/search?q=${encodeURIComponent(`${artistName} ${trackName}`)}`
      )
      if (searchRes && searchRes.length > 0) {
        const sorted = searchRes
          .filter((r) => r.duration && Math.abs(r.duration - duration) < 3000)
          .sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration))
        return jsonOk(sorted[0] || searchRes[0])
      }
    }

    return jsonOk(data || { plainLyrics: null, syncedLyrics: null })
  } catch (err) {
    return jsonError(err.message)
  }
}
