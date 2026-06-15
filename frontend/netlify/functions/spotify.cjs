try {
  const envPath = __dirname + '/../../.env'
  const fs = require('fs')
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i === -1) continue
      const k = t.slice(0, i).trim()
      let v = t.slice(i + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  }
} catch {}

const WOLFX_API = 'https://spotify.xwolf.space/api'
const SPOTIFY_PATTERNS = {
  track: /spotify\.com\/track\/([a-zA-Z0-9]+)/,
  album: /spotify\.com\/album\/([a-zA-Z0-9]+)/,
  playlist: /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
  artist: /spotify\.com\/artist\/([a-zA-Z0-9]+)/,
}

function hasArabic(text) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)
}

function normalizeText(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, '').trim()
}

function isArtistMatch(query, artistName) {
  const q = normalizeText(query)
  const a = normalizeText(artistName)
  if (a === q) return 2
  if (a.includes(q) || q.includes(a)) return 1
  if (hasArabic(query) && a.includes(q)) return 1
  return 0
}

// ── Official Spotify API (Client Credentials) ──
let _tokenCache = { token: null, expiresAt: 0 }

async function getSpotifyToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt - 60000) return _tokenCache.token
  const clientId = process.env.VITE_SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) return null
  const data = await res.json()
  _tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return data.access_token
}

async function officialFetch(path) {
  const token = await getSpotifyToken()
  if (!token) return null
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) return null
  return res.json()
}

async function wolfxFetch(path) {
  const res = await fetch(`${WOLFX_API}${path}`)
  if (!res.ok) return null
  const data = await res.json()
  return data.success ? data : null
}

function extractImage(entity) {
  try {
    const sources = entity.coverArt?.sources || []
    if (sources.length) { sources.sort((a, b) => (b.width || 0) - (a.width || 0)); return sources[0].url }
  } catch {}
  try {
    const images = entity.visualIdentity?.image || []
    if (images.length) { images.sort((a, b) => (b.maxHeight || 0) - (a.maxHeight || 0)); return images[0].url }
  } catch {}
  return null
}

function extractTrackImage(item) {
  for (const key of ['coverArt', 'albumOfTrack', 'album']) {
    try {
      const sub = item[key]; if (!sub) continue
      const sources = sub.coverArt?.sources || sub.sources || []
      if (sources.length) { sources.sort((a, b) => (b.width || 0) - (a.width || 0)); return sources[0].url }
    } catch {}
  }
  return null
}

function extractTrackAlbum(item) {
  for (const key of ['album', 'albumOfTrack']) {
    try { const album = item[key]; if (album?.name) return album.name } catch {}
  }
  return null
}

async function handleEmbedScrape(url, summary) {
  let kind = null, id = null
  for (const [k, pattern] of Object.entries(SPOTIFY_PATTERNS)) {
    const m = pattern.exec(url)
    if (m) { kind = k; id = m[1]; break }
  }
  if (!kind || !id) return { statusCode: 400, body: JSON.stringify({ error: 'Invalid Spotify URL' }) }
  const embedUrl = `https://open.spotify.com/embed/${kind}/${id}`
  const res = await fetch(embedUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
  })
  if (!res.ok) return { statusCode: 502, body: JSON.stringify({ error: `Spotify embed returned ${res.status}` }) }
  const html = await res.text()
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/)
  if (!match) return { statusCode: 502, body: JSON.stringify({ error: 'Could not find embed data' }) }
  const data = JSON.parse(match[1])
  const entity = data?.props?.pageProps?.state?.data?.entity
  if (!entity) return { statusCode: 502, body: JSON.stringify({ error: 'Unexpected embed JSON structure' }) }

  if (summary && kind !== 'track') {
    return {
      statusCode: 200,
      body: JSON.stringify({ id, name: entity.title || 'Unknown', image: extractImage(entity), track_count: (entity.trackList || []).length, owner: entity.ownerName || entity.subtitle || 'Spotify', description: entity.description || '' }),
    }
  }

  if (kind === 'track') {
    const artistName = entity.artists ? entity.artists.map(a => a.name).join(', ') : entity.subtitle || 'Unknown Artist'
    return {
      statusCode: 200,
      body: JSON.stringify({
        type: 'track', title: entity.title || 'Unknown Track', artist: artistName,
        artist_id: entity.artists?.[0]?.uri?.split(':')[2] || null,
        album: (entity.albumOfTrack || entity.album)?.name || 'Single',
        album_id: (entity.albumOfTrack || entity.album)?.uri?.split(':')[2] || null,
        artwork_url: extractImage(entity),
        url: `https://open.spotify.com/track/${id}`,
      }),
    }
  }

  const trackList = entity.trackList || []
  const collectionArtwork = extractImage(entity)
  const isAlbum = kind === 'album'
  const tracks = trackList
    .filter(item => item.uri && item.uri.startsWith('spotify:track:'))
    .map(item => ({
      title: item.title || 'Unknown Track',
      artist: item.subtitle || 'Unknown Artist',
      album: extractTrackAlbum(item) || (isAlbum ? entity.title : 'Unknown Album'),
      artwork_url: extractTrackImage(item) || collectionArtwork,
      url: `https://open.spotify.com/track/${item.uri.split(':')[2]}`,
      type: 'track',
    }))

  return {
    statusCode: 200,
    body: JSON.stringify({ type: 'collection', collection_name: entity.title || 'Unknown', collection_artwork: collectionArtwork, collection_type: entity.type === 'album' ? 'album' : 'playlist', tracks }),
  }
}

async function handleSearch(query, types, limit) {
  const typesArr = types.split(',').map(t => t.trim())
  const searches = typesArr.map(type =>
    wolfxFetch(`/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`)
      .then(d => ({ type, data: d })).catch(() => ({ type, data: null }))
  )
  const results = await Promise.all(searches)

  const anyResults = results.some(r => r.data?.results?.length > 0)
  if (!anyResults) {
    try {
      const officialResults = await Promise.all(typesArr.map(type =>
        officialSearch(query, type, limit).then(d => ({ type, data: d })).catch(() => ({ type, data: null }))
      ))
      if (officialResults.some(r => r.data?.length > 0)) results.splice(0, results.length, ...officialResults)
    } catch {}
  }

  const result = { tracks: [], albums: [], artists: [], playlists: [], top_artist: null }
  for (const { type, data } of results) {
    if (!data) continue
    const items = data.results || data || []
    if (!Array.isArray(items)) continue
    if (type === 'track') {
      result.tracks = items.map(t => ({
        id: t.id, title: t.title, artist: t.artist,
        artist_id: t.artist_id || t.artists?.[0]?.id || null,
        album_id: t.album_id || t.album?.id || null,
        album: t.album || t.album?.name || 'Unknown',
        artwork_url: t.thumbnail || t.artwork_url || t.album?.images?.[0]?.url || null,
        url: t.url || `https://open.spotify.com/track/${t.id}`,
        duration_ms: t.duration_ms || t.duration || 0,
      }))
    } else if (type === 'artist') {
      result.artists = items.map(a => ({
        id: a.id, name: a.name,
        image: a.thumbnail || a.image || a.images?.[0]?.url || null,
        genres: a.genres || [], followers: a.followers || 0,
        url: `https://open.spotify.com/artist/${a.id}`,
      }))
    } else if (type === 'album') {
      result.albums = items.map(a => ({
        id: a.id, name: a.name, artist: a.artist || a.artists?.[0]?.name || '',
        image: a.thumbnail || a.images?.[0]?.url || null,
        year: a.year || (a.release_date ? a.release_date.slice(0, 4) : null),
        url: `https://open.spotify.com/album/${a.id}`,
      }))
    } else if (type === 'playlist') {
      result.playlists = items.map(p => ({
        id: p.id, name: p.name, description: p.description || '',
        image: p.thumbnail || p.images?.[0]?.url || null,
        owner: p.owner || p.owner?.display_name || 'Spotify',
        trackCount: p.track_count || p.tracks?.total || 0,
      }))
    }
  }

  const bestMatch = result.artists.reduce((best, a) => {
    const score = isArtistMatch(query, a.name)
    return score > best.score ? { artist: a, score } : best
  }, { artist: null, score: 0 })
  if (bestMatch.score >= 1) result.top_artist = bestMatch.artist

  return { statusCode: 200, body: JSON.stringify(result) }
}

async function officialSearch(query, type, limit) {
  const token = await getSpotifyToken()
  if (!token) return null
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}&market=EG`,
    { headers: { 'Authorization': `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }
  )
  if (!res.ok) return null
  const data = await res.json()
  if (type === 'track') return (data.tracks?.items || []).map(t => ({
    id: t.id, title: t.name, artist: t.artists?.map(a => a.name).join(', ') || 'Unknown',
    artist_id: t.artists?.[0]?.id || null, album: t.album?.name || 'Unknown',
    album_id: t.album?.id || null, thumbnail: t.album?.images?.[0]?.url || null,
    url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`, duration_ms: t.duration_ms || 0,
  }))
  if (type === 'artist') return (data.artists?.items || []).map(a => ({
    id: a.id, name: a.name, thumbnail: a.images?.[0]?.url || null, genres: a.genres || [], followers: a.followers?.total || 0,
  }))
  if (type === 'album') return (data.albums?.items || []).map(a => ({
    id: a.id, name: a.name, artist: a.artists?.[0]?.name || '', thumbnail: a.images?.[0]?.url || null, year: a.release_date?.slice(0, 4) || null,
  }))
  if (type === 'playlist') return (data.playlists?.items || []).map(p => ({
    id: p.id, name: p.name, description: p.description || '', thumbnail: p.images?.[0]?.url || null,
    owner: p.owner?.display_name || 'Spotify', track_count: p.tracks?.total || 0,
  }))
  return null
}

async function handleArtist(id) {
  const [profile, topTracks, albums] = await Promise.all([
    wolfxFetch(`/artist/${id}`), wolfxFetch(`/artist/${id}/top-tracks`), wolfxFetch(`/artist/${id}/albums?limit=20`),
  ])
  if (!profile) {
    try {
      const official = await officialFetch(`/artists/${id}`)
      if (official) {
        const [topTracksOfficial, albumsOfficial] = await Promise.all([
          officialFetch(`/artists/${id}/top-tracks?market=EG`).catch(() => null),
          officialFetch(`/artists/${id}/albums?limit=20&market=EG`).catch(() => null),
        ])
        return { statusCode: 200, body: JSON.stringify({
          id, name: official.name || 'Unknown', image: official.images?.[0]?.url || null,
          genres: official.genres || [], followers: official.followers?.total || 0, popularity: official.popularity || 0,
          top_tracks: (topTracksOfficial?.tracks || []).map(t => ({
            id: t.id, title: t.name, album: t.album?.name || 'Unknown',
            artist: t.artists?.map(a => a.name).join(', ') || official.name,
            artist_id: t.artists?.[0]?.id || null, album_id: t.album?.id || null,
            artwork_url: t.album?.images?.[0]?.url || null, url: `https://open.spotify.com/track/${t.id}`, duration_ms: t.duration_ms || 0,
          })),
          albums: (albumsOfficial?.items || []).map(a => ({
            id: a.id, name: a.name, image: a.images?.[0]?.url || null, year: a.release_date?.slice(0, 4) || null,
            url: `https://open.spotify.com/album/${a.id}`, type: a.album_type || 'album',
          })),
        })}
      }
    } catch {}
    return { statusCode: 404, body: JSON.stringify({ error: 'Artist not found' }) }
  }
  const p = profile.artist || profile
  return { statusCode: 200, body: JSON.stringify({
    id, name: p.name || 'Unknown', image: p.image || p.thumbnail || null,
    genres: p.genres || [], followers: p.followers || 0, popularity: p.popularity || 0,
    top_tracks: ((topTracks?.tracks || topTracks?.results) || []).map(t => ({
      id: t.id, title: t.title, album: t.album || 'Unknown', artist: t.artist || p.name,
      artist_id: t.artist_id || null, album_id: t.album_id || null, artwork_url: t.thumbnail || null,
      url: `https://open.spotify.com/track/${t.id}`, duration_ms: t.duration_ms || 0,
    })),
    albums: ((albums?.albums || albums?.results) || []).map(a => ({
      id: a.id, name: a.name, image: a.thumbnail || null, year: a.year || null,
      url: `https://open.spotify.com/album/${a.id}`, type: a.type || 'album',
    })),
  })}
}

async function handleTrack(id) {
  const data = await wolfxFetch(`/track/${id}`)
  if (data) {
    const t = data.track || data
    const albumName = typeof t.album === 'string' ? t.album : t.album?.name || null
    const albumId = typeof t.album === 'string' ? null : t.album?.id || null
    if (t.title && albumName) {
      return { statusCode: 200, body: JSON.stringify({
        id: t.id, title: t.title || 'Unknown Track',
        artist: t.artists?.map(a => a.name).join(', ') || t.artist || 'Unknown Artist',
        artist_id: t.artists?.[0]?.id || null,
        album: albumName, album_id: albumId,
        artwork_url: t.thumbnail || t.artwork_url || null,
        url: `https://open.spotify.com/track/${id}`, duration_ms: t.duration_ms || 0,
      })}
    }
  }

  const embedResult = await handleEmbedScrape(`https://open.spotify.com/track/${id}`, false)
  if (embedResult.statusCode === 200) {
    const parsed = JSON.parse(embedResult.body)
    if (parsed.title && parsed.title !== 'Unknown Track') return embedResult
  }

  const official = await officialFetch(`/tracks/${id}`)
  if (official) {
    return { statusCode: 200, body: JSON.stringify({
      id: official.id, title: official.name || 'Unknown Track',
      artist: official.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
      artist_id: official.artists?.[0]?.id || null,
      album: official.album?.name || 'Unknown Album', album_id: official.album?.id || null,
      artwork_url: official.album?.images?.[0]?.url || null,
      url: official.external_urls?.spotify || `https://open.spotify.com/track/${id}`, duration_ms: official.duration_ms || 0,
    })}
  }

  try {
    const oembedRes = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent('https://open.spotify.com/track/' + id)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }
    )
    if (oembedRes.ok) {
      const oembed = await oembedRes.json()
      return { statusCode: 200, body: JSON.stringify({
        id, title: oembed.title || 'Unknown Track', artist: oembed.author_name || 'Unknown Artist',
        artist_id: null, album: 'Single', album_id: null, artwork_url: oembed.thumbnail_url || null,
        url: `https://open.spotify.com/track/${id}`, duration_ms: 0,
      })}
    }
  } catch {}

  if (embedResult.statusCode === 200) return embedResult
  return { statusCode: 404, body: JSON.stringify({ error: 'Track not found' }) }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }
  try {
    const body = JSON.parse(event.body)
    if (body.action === 'search') return await handleSearch(body.query, body.types || 'track,artist,album,playlist', body.limit || 10)
    if (body.action === 'artist') return await handleArtist(body.id)
    if (body.action === 'track') return await handleTrack(body.id)
    return await handleEmbedScrape(body.url, body.summary)
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
