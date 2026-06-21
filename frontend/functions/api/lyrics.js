const LRCLIB_API = 'https://lrclib.net/api'

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

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u0400-\u04FF\u0E00-\u0E7F]/g, '').trim()
}

function titleMatches(expectedTitle, expectedArtist, result) {
  const t = normalize(expectedTitle)
  const a = normalize(expectedArtist)
  const rt = normalize(result.trackName || '')
  const ra = normalize(result.artistName || '')
  if (!t || !rt) return false
  return (rt.includes(t) || t.includes(rt)) && (!a || !ra || ra.includes(a) || a.includes(ra))
}

async function fetchLrcLib(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SpotDL/1.0 (github.com/user/spotdl)', 'Lrclib-Client': 'SpotDL/1.0' },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`LRCLIB returned ${res.status}`)
  return res.json()
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

    let data = await fetchLrcLib(`${LRCLIB_API}/get?${params}`)

    if (!data) {
      const searchQuery = encodeURIComponent(`${artistName} ${trackName}`)
      const searchRes = await fetchLrcLib(`${LRCLIB_API}/search?q=${searchQuery}`)

      if (searchRes && searchRes.length > 0) {
        let candidates = searchRes.filter(r => titleMatches(trackName, artistName, r))

        if (duration) {
          candidates = candidates.filter(r => r.duration && Math.abs(r.duration - duration) < 3000)
        }

        if (candidates.length > 0) {
          if (duration) {
            candidates.sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration))
          }
          data = candidates[0]
        }
      }
    }

    return jsonOk(data || { plainLyrics: null, syncedLyrics: null })
  } catch (err) {
    return jsonError(err.message)
  }
}
