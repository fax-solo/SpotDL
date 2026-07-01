function abortTimeout(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

const WOLFX_API = 'https://spotify.xwolf.space/api'
const SPOTIFY_PATTERNS = {
  track: /spotify\.com\/track\/([a-zA-Z0-9]+)/,
  album: /spotify\.com\/album\/([a-zA-Z0-9]+)/,
  playlist: /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
  artist: /spotify\.com\/artist\/([a-zA-Z0-9]+)/,
  show: /spotify\.com\/show\/([a-zA-Z0-9]+)/,
  episode: /spotify\.com\/episode\/([a-zA-Z0-9]+)/,
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

let _tokenCache = { token: null, expiresAt: 0 }

async function getSpotifyToken(context) {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt - 60000) return _tokenCache.token
  const clientId = context.env.VITE_SPOTIFY_CLIENT_ID
  const clientSecret = context.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(clientId + ':' + clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: abortTimeout(10000),
  })
  if (!res.ok) return null
  const data = await res.json()
  _tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return data.access_token
}

async function officialFetch(context, path) {
  const token = await getSpotifyToken(context)
  if (!token) return null
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
    signal: abortTimeout(5000),
  })
  if (!res.ok) return null
  return res.json()
}

const _cache = new Map()
const CACHE_TTL = 30000
const EMBED_CACHE_TTL = 300000

async function wolfxFetch(path) {
  const cached = _cache.get(path)
  if (cached && Date.now() < cached.expires) return cached.data
  try {
    const res = await fetch(`${WOLFX_API}${path}`, { signal: abortTimeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    const result = data.success ? data : null
    _cache.set(path, { data: result, expires: Date.now() + CACHE_TTL })
    if (_cache.size > 200) {
      const now = Date.now()
      for (const [k, v] of _cache) { if (now >= v.expires) _cache.delete(k) }
    }
    return result
  } catch {
    return null
  }
}

function cacheKey(kind, id, summary) {
  return `embed:${kind}:${id}:${summary ? '1' : '0'}`
}

function getCachedResponse(kind, id, summary) {
  const key = cacheKey(kind, id, summary)
  const entry = _cache.get(key)
  if (entry && Date.now() < entry.expires) return entry.data
  return null
}

function setCachedResponse(kind, id, summary, data) {
  const key = cacheKey(kind, id, summary)
  _cache.set(key, { data, expires: Date.now() + EMBED_CACHE_TTL })
  if (_cache.size > 300) {
    const now = Date.now()
    for (const [k, v] of _cache) { if (now >= v.expires) _cache.delete(k) }
  }
}

// Race multiple source fetchers — first non-null result wins
async function raceSources(sources, timeoutMs = 3000) {
  return new Promise(resolve => {
    let settled = false
    for (const fn of sources) {
      Promise.resolve(fn()).then(val => {
        if (settled) return
        if (val !== null && val !== undefined) {
          settled = true
          resolve(val)
        }
      }).catch(() => {})
    }
    setTimeout(() => { if (!settled) { settled = true; resolve(null) } }, timeoutMs)
  })
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
  try { if (item.image) return item.image } catch {}
  try { if (item.images?.[0]?.url) return item.images[0].url } catch {}
  try { if (item.thumbnail) return item.thumbnail } catch {}
  try { if (item.artwork_url) return item.artwork_url } catch {}
  try {
    const album = item.albumOfTrack || item.album
    if (album?.images?.[0]?.url) return album.images[0].url
    if (album?.image) return album.image
  } catch {}
  try {
    if (item.albumOfTrack?.coverArt?.sources?.length) {
      const s = [...item.albumOfTrack.coverArt.sources].sort((a, b) => (b.width || 0) - (a.width || 0))
      return s[0].url
    }
  } catch {}
  return null
}

function extractTrackAlbum(item) {
  for (const key of ['album', 'albumOfTrack']) {
    try { const album = item[key]; if (album?.name) return album.name } catch {}
  }
  return null
}

async function fillTrackArtwork(tracks, ids, collectionArtwork, context) {
  const stillMissing = () => ids.filter(id => {
    const idx = tracks.findIndex(t => t.url.includes(id))
    return idx !== -1 && (!tracks[idx].artwork_url || tracks[idx].artwork_url === collectionArtwork)
  })

  try {
    const token = await getSpotifyToken(context)
    if (token) {
      const todo = stillMissing()
      for (let i = 0; i < todo.length; i += 50) {
        const batch = todo.slice(i, i + 50)
        const res = await fetch(`https://api.spotify.com/v1/tracks?ids=${batch.join(',')}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: abortTimeout(10000),
        })
        if (!res.ok) continue
        const data = await res.json()
        for (const t of data.tracks || []) {
          if (!t?.album?.images?.[0]?.url) continue
          const idx = tracks.findIndex(track => track.url.includes(t.id))
          if (idx !== -1) tracks[idx].artwork_url = t.album.images[0].url
        }
      }
    }
  } catch {}

  {
    const todo = stillMissing().slice(0, 30)
    if (todo.length > 0) {
      const results = await Promise.allSettled(
        todo.map(id =>
          wolfxFetch(`/track/${id}`)
            .then(d => ({ id, data: d }))
        )
      )
      for (const r of results) {
        if (r.status !== 'fulfilled' || !r.value.data) continue
        const t = r.value.data.track || r.value.data
        const artwork = t.thumbnail || t.artwork_url || t.album?.images?.[0]?.url || null
        if (!artwork) continue
        const idx = tracks.findIndex(track => track.url.includes(r.value.id))
        if (idx !== -1) tracks[idx].artwork_url = artwork
      }
    }
  }
}

async function handleEmbedScrape(context, url, summary) {
  let kind = null, id = null
  for (const [k, pattern] of Object.entries(SPOTIFY_PATTERNS)) {
    const m = pattern.exec(url)
    if (m) { kind = k; id = m[1]; break }
  }
  if (!kind || !id) return jsonError('Invalid Spotify URL', 400)

  const cached = getCachedResponse(kind, id, summary)
  if (cached) return cached

  if (kind === 'playlist' || kind === 'album') {
    try {
      const wolfData = await wolfxFetch(`/${kind}/${id}`)
      if (wolfData) {
        const entity = wolfData.playlist || wolfData.album || wolfData
        if (entity && entity.trackList && entity.trackList.length > 0) {
          return await handleEmbeddedEntity(context, kind, id, entity, summary)
        }
      }
    } catch {}
  }

  const embedUrl = `https://open.spotify.com/embed/${kind}/${id}`
  const UAS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/118.0.0.0 Safari/537.36',
  ]
  let lastErr = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const ua = UAS[attempt % UAS.length]
    const res = await fetch(embedUrl, {
      headers: { 'User-Agent': ua, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: abortTimeout(8000),
    })
    if (res.ok) {
      const html = await res.text()
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/)
      if (match) {
        const data = JSON.parse(match[1])
        const entity = data?.props?.pageProps?.state?.data?.entity
        if (entity) return await handleEmbeddedEntity(context, kind, id, entity, summary)
      }
      return jsonError('Could not find embed data', 502)
    }
    if (res.status === 429) {
      lastErr = { status: 429, msg: 'Spotify rate limited' }
      const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500
      await new Promise(r => setTimeout(r, delay))
      continue
    }
    return jsonError(`Spotify returned ${res.status}`, 502)
  }
  return jsonError(lastErr.msg, 429)
}

async function handleEmbeddedEntity(context, kind, id, entity, summary) {
  const result = buildEmbedResult(kind, id, entity, summary)

  if (result && typeof result.buildResponse === 'function') {
    if (result.noArtworkIds.length > 0 && !summary && kind !== 'album') {
      await fillTrackArtwork(result.tracks, result.noArtworkIds, result.collectionArtwork, context)
    }
    const resp = result.buildResponse()
    setCachedResponse(kind, id, summary, resp)
    return resp
  }

  setCachedResponse(kind, id, summary, result)
  return result
}

function buildEmbedResult(kind, id, entity, summary) {
  if (summary && kind !== 'track') {
    return jsonOk({
      id, name: entity.title || 'Unknown', image: extractImage(entity),
      track_count: (entity.trackList || []).length,
      owner: entity.ownerName || entity.subtitle || 'Spotify',
      description: entity.description || '',
    })
  }

  if (kind === 'track') {
    const artistName = entity.artists ? entity.artists.map(a => a.name).join(', ') : entity.subtitle || 'Unknown Artist'
    return jsonOk({
      type: 'track', title: entity.title || 'Unknown Track', artist: artistName,
      artist_id: entity.artists?.[0]?.uri?.split(':')[2] || null,
      album: (entity.albumOfTrack || entity.album)?.name || 'Single',
      album_id: (entity.albumOfTrack || entity.album)?.uri?.split(':')[2] || null,
      artwork_url: extractImage(entity),
      url: `https://open.spotify.com/track/${id}`,
    })
  }

  const trackList = entity.trackList || []
  const collectionArtwork = extractImage(entity)
  const isAlbum = kind === 'album'
  const noArtworkIds = []
  const tracks = trackList
    .filter(item => item.uri && item.uri.startsWith('spotify:track:'))
    .map(item => {
      const artwork = extractTrackImage(item)
      if (!artwork) noArtworkIds.push(item.uri.split(':')[2])
      return {
        title: item.title || 'Unknown Track',
        artist: item.subtitle || 'Unknown Artist',
        album: extractTrackAlbum(item) || (isAlbum ? entity.title : 'Unknown Album'),
        artwork_url: artwork,
        url: `https://open.spotify.com/track/${item.uri.split(':')[2]}`,
        type: 'track',
      }
    })

  return {
    tracks,
    noArtworkIds,
    collectionArtwork,
    buildResponse() {
      return jsonOk({
        type: 'collection',
        collection_name: entity.title || 'Unknown',
        collection_artwork: collectionArtwork,
        collection_type: entity.type === 'album' ? 'album' : 'playlist',
        tracks,
      })
    },
  }
}

async function enrichTrackArtwork(tracks) {
  const missing = tracks.filter(t => !t.artwork_url).map(t => t.id).slice(0, 15)
  if (missing.length === 0) return
  const results = await Promise.allSettled(
    missing.map(id =>
      wolfxFetch(`/track/${id}`).then(d => ({ id, data: d }))
    )
  )
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value.data) continue
    const t = r.value.data.track || r.value.data
    const artwork = t.thumbnail || t.artwork_url || t.image || t.album?.images?.[0]?.url || null
    if (!artwork) continue
    const idx = tracks.findIndex(track => track.id === r.value.id)
    if (idx !== -1) tracks[idx].artwork_url = artwork
  }
}

async function handleSearch(context, query, types, limit) {
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
        officialSearch(context, query, type, limit).then(d => ({ type, data: d })).catch(() => ({ type, data: null }))
      ))
      if (officialResults.some(r => r.data?.length > 0)) results.splice(0, results.length, ...officialResults)
    } catch {}
  }

  const result = { tracks: [], albums: [], artists: [], playlists: [], shows: [], top_artist: null }
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
      enrichTrackArtwork(result.tracks).catch(() => {})
    } else if (type === 'artist') {
      result.artists = items.map(a => ({
        id: a.id, name: a.name,
        image: a.thumbnail || a.image || a.images?.[0]?.url || null,
        genres: a.genres || [], followers: a.followers?.total || 0,
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
    } else if (type === 'show') {
      result.shows = items.map(s => ({
        id: s.id, name: s.name, publisher: s.publisher,
        description: s.description || '', image: s.thumbnail || null,
        total_episodes: s.total_episodes || 0,
      }))
    }
  }

  const bestMatch = result.artists.reduce((best, a) => {
    const score = isArtistMatch(query, a.name)
    return score > best.score ? { artist: a, score } : best
  }, { artist: null, score: 0 })
  if (bestMatch.score >= 1) result.top_artist = bestMatch.artist

  if (!result.top_artist && result.tracks.length > 0) {
    const seen = new Set()
    for (const t of result.tracks) {
      if (!t.artist_id) continue
      const name = t.artist
      if (!name || name === 'Unknown' || seen.has(name)) continue
      seen.add(name)
      result.artists.push({
        id: t.artist_id,
        name,
        image: null, genres: [], followers: 0,
        url: `https://open.spotify.com/artist/${t.artist_id}`,
      })
    }
    if (result.artists.length > 0) {
      result.artists.sort((a, b) => isArtistMatch(query, b.name) - isArtistMatch(query, a.name))
      result.top_artist = result.artists[0]
    }
  }

  return jsonOk(result)
}

async function officialSearch(context, query, type, limit) {
  const token = await getSpotifyToken(context)
  if (!token) return null
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}&market=EG`,
    { headers: { 'Authorization': `Bearer ${token}` }, signal: abortTimeout(5000) }
  )
  if (!res.ok) return null
  const data = await res.json()
  if (type === 'track') return (data.tracks?.items || []).map(t => ({
    id: t.id, title: t.name, artist: t.artists?.map(a => a.name).join(', ') || 'Unknown',
    artist_id: t.artists?.[0]?.id || null, album: t.album?.name || 'Unknown',
    album_id: t.album?.id || null, thumbnail: t.album?.images?.[0]?.url || null,
    url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`, duration_ms: t.duration_ms || 0,
    isrc: t.external_ids?.isrc || null,
  }))
  if (type === 'artist') return (data.artists?.items || []).map(a => ({
    id: a.id, name: a.name, thumbnail: a.images?.[0]?.url || null, genres: a.genres || [], followers: a.followers?.total || 0,
  }))
  if (type === 'album') return (data.albums?.items || []).map(a => ({
    id: a.id, name: a.name,     artist: a.artists?.[0]?.name || '', thumbnail: a.images?.[0]?.url || null, year: a.release_date?.slice(0, 4) || null,
  }))
  if (type === 'playlist') return (data.playlists?.items || []).map(p => ({
    id: p.id, name: p.name, description: p.description || '', thumbnail: p.images?.[0]?.url || null,
    owner: p.owner?.display_name || 'Spotify', track_count: p.tracks?.total || 0,
  }))
  if (type === 'show') return (data.shows?.items || []).map(s => ({
    id: s.id, name: s.name, publisher: s.publisher, description: s.description || '',
    thumbnail: s.images?.[0]?.url || null, total_episodes: s.total_episodes || 0,
  }))
  return null
}

async function handleArtist(context, id) {
  const [profile, topTracks, albums, relatedOfficial, appearsOnOfficial] = await Promise.all([
    wolfxFetch(`/artist/${id}`),
    wolfxFetch(`/artist/${id}/top-tracks`),
    wolfxFetch(`/artist/${id}/albums?limit=20`),
    officialFetch(context, `/artists/${id}/related-artists`).catch(() => null),
    officialFetch(context, `/artists/${id}/albums?include_groups=appears_on&limit=10&market=EG`).catch(() => null),
  ])

  const appearsOnAlbums = (appearsOnOfficial?.items || []).map(a => ({
    id: a.id, name: a.name, image: a.images?.[0]?.url || null,
    year: a.release_date?.slice(0, 4) || null,
    url: `https://open.spotify.com/album/${a.id}`, type: a.album_type || 'album',
    artist: a.artists?.map(ar => ar.name).join(', ') || '',
  }))

  const relatedArtists = (relatedOfficial?.artists || []).map(a => ({
    id: a.id, name: a.name, image: a.images?.[0]?.url || null,
  }))

  if (!profile) {
    try {
      const official = await officialFetch(context, `/artists/${id}`)
      if (official) {
        const [topTracksOfficial, albumsOfficial] = await Promise.all([
          officialFetch(context, `/artists/${id}/top-tracks?market=EG`).catch(() => null),
          officialFetch(context, `/artists/${id}/albums?limit=20&market=EG&include_groups=album,single,compilation`).catch(() => null),
        ])
        const albumList = (albumsOfficial?.items || []).map(a => ({
          id: a.id, name: a.name, image: a.images?.[0]?.url || null, year: a.release_date?.slice(0, 4) || null,
          url: `https://open.spotify.com/album/${a.id}`, type: a.album_type || 'album',
        }))
        albumList.sort((a, b) => (b.year || 0) - (a.year || 0))
        return jsonOk({
          id, name: official.name || 'Unknown', image: official.images?.[0]?.url || null,
          genres: official.genres || [], followers: official.followers?.total || 0, popularity: official.popularity || 0,
          top_tracks: (topTracksOfficial?.tracks || []).map(t => ({
            id: t.id, title: t.name, album: t.album?.name || 'Unknown',
            artist: t.artists?.map(a => a.name).join(', ') || official.name,
            artist_id: t.artists?.[0]?.id || null, album_id: t.album?.id || null,
            artwork_url: t.album?.images?.[0]?.url || null, url: `https://open.spotify.com/track/${t.id}`, duration_ms: t.duration_ms || 0,
            isrc: t.external_ids?.isrc || null,
          })),
          albums: albumList,
          latest_release: albumList[0] || null,
          featuring: appearsOnAlbums,
          related_artists: relatedArtists,
        })
      }
    } catch {}
    try {
      const embedRes = await fetch(`https://open.spotify.com/embed/artist/${id}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
        signal: abortTimeout(8000),
      })
      if (embedRes.ok) {
        const html = await embedRes.text()
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/)
        if (match) {
          const data = JSON.parse(match[1])
          const entity = data?.props?.pageProps?.state?.data?.entity
          if (entity && entity.title) {
            const tracks = (entity.trackList || []).map(t => ({
              id: t.uri?.split(':')[2] || '',
              title: t.title || 'Unknown',
              album: extractTrackAlbum(t) || 'Single',
              artist: t.subtitle || entity.title,
              artist_id: id,
              album_id: null,
              artwork_url: extractTrackImage(t) || extractImage(entity),
              url: t.uri ? `https://open.spotify.com/track/${t.uri.split(':')[2]}` : '',
              duration_ms: 0,
            }))
            return jsonOk({
              id, name: entity.title, image: extractImage(entity),
              genres: [], followers: 0, popularity: 0,
              top_tracks: tracks, albums: [], latest_release: null,
              featuring: [], related_artists: [],
            })
          }
        }
      }
    } catch {}
    return jsonError('Artist not found', 404)
  }
  const p = profile.artist || profile
  const albumList = ((albums?.albums || albums?.results) || []).map(a => ({
    id: a.id, name: a.name, image: a.thumbnail || null, year: a.year || null,
    url: `https://open.spotify.com/album/${a.id}`, type: a.type || 'album',
  }))
  albumList.sort((a, b) => (b.year || 0) - (a.year || 0))

  const topTracksArr = ((topTracks?.tracks || topTracks?.results) || []).map(t => ({
    id: t.id, title: t.title, album: t.album || 'Unknown', artist: t.artist || p.name,
    artist_id: t.artist_id || null, album_id: t.album_id || null, artwork_url: t.thumbnail || t.artwork_url || t.album?.images?.[0]?.url || null,
    url: `https://open.spotify.com/track/${t.id}`, duration_ms: t.duration_ms || 0,
  }))
  enrichTrackArtwork(topTracksArr).catch(() => {})
  return jsonOk({
    id, name: p.name || 'Unknown', image: p.image || p.thumbnail || null,
    genres: p.genres || [], followers: p.followers || 0, popularity: p.popularity || 0,
    top_tracks: topTracksArr,
    albums: albumList,
    latest_release: albumList[0] || null,
    featuring: appearsOnAlbums,
    related_artists: relatedArtists,
  })
}

// ═══════════════════════════════════════════════════════
// Partner API (merged from spotify-partner.js)
// ═══════════════════════════════════════════════════════

const PARTNER_API = 'https://api-partner.spotify.com/pathfinder/v1/query'
const WEB_PLAYER = 'https://open.spotify.com'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const FALLBACK_HASHES = {
  libraryV3: 'a6cb8387bc0f12b34f2a9ac5ed4225d55398d85fea8a865a3e5f84c7882cfedd',
  searchDesktop: '9400aabe3fd508b7041a07449a3e2e16e67f7c4c44b99ac991103a7425e4a3da',
  fetchPlaylist: 'a3e356cf1aa7eba20000953fc0c823a1db062b8eaec5b37ec9e63165bb1d1299',
  getTrack: 'eab5a5f8e3121ccbe94a513153637106d87b1c29e2e94c3e84b3824185381e77',
  fetchLibraryTracks: '3acb6bf4761d8a2bf592a75bf5dcec8eff7e2a7b8612ac74c55e4ab31a347393',
  addToLibrary: '8076c11296e5d862541ec1cb3ef351893ad0b05ff4eac80db5022be4bcb76abb',
  removeFromLibrary: '17b3a57ec9f60a68a8fb6bbd804a77807c888d8c5d8817a4d75134b7813b2b80',
  getPlaylist: '7bd86c428155868204b104575c44df9c69534cea7ab5ba1f551c36e69e8e6a53',
  getAlbum: '5d7696d61c11c1b7a2e6c5e4c5e6b8e0b68a3ce1b68c6a5e3c4e7b9c8d9f1a0b',
  getArtist: '2c2e0c3c5e6a0b7c8d9e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b',
}

let hashCache = null
let hashCacheTime = 0
const HASH_TTL = 3600000

function base32(buf) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const b of buf) bits += b.toString(2).padStart(8, '0')
  let r = ''
  for (let i = 0; i + 5 <= bits.length; i += 5)
    r += abc[parseInt(bits.slice(i, i + 5), 2)]
  return r
}

const FALLBACK_SECRET = { v: 61, s: [44,55,47,42,70,40,34,114,76,74,50,111,120,97,75,76,94,102,43,69,49,120,118,80,64,78] }

let secretCache = { ...FALLBACK_SECRET, ts: 0 }

async function refreshSecrets() {
  try {
    const r = await fetch('https://code.thetadev.de/ThetaDev/spotify-secrets/raw/branch/main/secrets/secretDict.json', { signal: abortTimeout(5000) })
    if (!r.ok) return
    const d = await r.json()
    const vs = Object.keys(d).map(Number).sort((a, b) => b - a)
    if (vs.length) secretCache = { v: vs[0], s: d[vs[0]], ts: Date.now() }
  } catch {}
}

function writeBigInt64BE(buf, val) {
  for (let i = 7; i >= 0; i--) { buf[i] = Number(val & 0xffn); val >>= 8n }
}

async function makeTOTP() {
  const { v, s } = secretCache
  const t = s.map((e, i) => e ^ ((i % 33) + 9))
  const encoder = new TextEncoder()
  const hBytes = encoder.encode(t.join(''))
  const hexBytes = Array.from(hBytes).map(b => b.toString(16).padStart(2, '0')).join('')
  const h = new Uint8Array(hexBytes.length / 2)
  for (let i = 0; i < hexBytes.length; i += 2) h[i / 2] = parseInt(hexBytes.slice(i, i + 2), 16)
  const b32 = base32(h)
  const time = Math.floor(Date.now() / 30000)
  const tb = new Uint8Array(8)
  writeBigInt64BE(tb, BigInt(time))
  const keyBytes = new TextEncoder().encode(b32)
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, tb)
  const hmac = new Uint8Array(sig)
  const off = hmac[hmac.length - 1] & 0xf
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3]
  return { totp: String(code % 1000000).padStart(6, '0'), version: v }
}

async function getPartnerToken() {
  if (!secretCache.ts) await refreshSecrets()
  const { totp, version } = await makeTOTP()
  const url = `${WEB_PLAYER}/api/token?reason=init&productType=web-player&totp=${totp}&totpVer=${version}&totpServer=${totp}`
  const r = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(`Token failed ${r.status}: ${t.slice(0, 100)}`)
  }
  return r.json()
}

async function getHashes() {
  const now = Date.now()
  if (hashCache && now - hashCacheTime < HASH_TTL) return { ...FALLBACK_HASHES, ...hashCache }
  try {
    const page = await fetch(WEB_PLAYER, { headers: { 'User-Agent': UA } })
    const html = await page.text()
    const configMatch = html.match(/<script id="appServerConfig"[^>]*>(.*?)<\/script>/)
    let clientVersion = '1.2.61.400'
    if (configMatch) {
      try {
        const encoded = configMatch[1]
        const binaryStr = atob(encoded)
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
        const decoder = new TextDecoder()
        const cfg = JSON.parse(decoder.decode(bytes))
        if (cfg.clientVersion) clientVersion = cfg.clientVersion
      } catch {}
    }
    const seen = new Set()
    const bundles = []
    const srcRe = /<script[^>]+src="([^"]+)"[^>]*>/g
    let m
    while ((m = srcRe.exec(html)) !== null) {
      const s = m[1]
      if (s.includes('.js') && !seen.has(s)) {
        seen.add(s)
        bundles.push(s.startsWith('http') ? s : s.startsWith('//') ? 'https:' + s : WEB_PLAYER + s)
      }
    }
    let allJS = ''
    for (const url of bundles) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: abortTimeout(10000) })
        if (r.ok) allJS += await r.text() + '\n'
      } catch {}
    }
    const found = {}
    for (const name of Object.keys(FALLBACK_HASHES)) {
      const qm = allJS.match(new RegExp(`"${name}","query","([a-f0-9]+)"`))
      if (qm) found[name] = qm[1]
      else {
        const mm = allJS.match(new RegExp(`"${name}","mutation","([a-f0-9]+)"`))
        if (mm) found[name] = mm[1]
      }
    }
    hashCache = found
    hashCacheTime = now
    return { ...FALLBACK_HASHES, ...found }
  } catch { return FALLBACK_HASHES }
}

async function partnerQuery(operationName, variables, accessToken) {
  const hashes = await getHashes()
  const hash = hashes[operationName]
  if (!hash) throw new Error(`Unknown operation: ${operationName}`)
  const params = new URLSearchParams({
    operationName,
    variables: JSON.stringify(variables),
    extensions: JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }),
  })
  const r = await fetch(`${PARTNER_API}?${params}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': UA,
      'app-platform': 'WebPlayer',
      'Accept-Language': 'en',
    },
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(`Partner API ${r.status}: ${t.slice(0, 300)}`)
  }
  return r.json()
}

// Fast oEmbed-based track fetch (public Spotify API, very fast)
async function oEmbedTrack(context, id) {
  const res = await fetch(
    `https://open.spotify.com/oembed?url=${encodeURIComponent('https://open.spotify.com/track/' + id)}`,
    { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: abortTimeout(3000) }
  )
  if (!res.ok) return null
  const oembed = await res.json()
  return {
    id, title: oembed.title || 'Unknown Track', artist: oembed.author_name || 'Unknown Artist',
    artist_id: null, album: 'Single', album_id: null, artwork_url: oembed.thumbnail_url || null,
    url: `https://open.spotify.com/track/${id}`, duration_ms: 0,
  }
}

// Fast WolfX-based track fetch
async function wolfxTrack(id) {
  const data = await wolfxFetch(`/track/${id}`)
  if (!data) return null
  const t = data.track || data
  const albumName = typeof t.album === 'string' ? t.album : t.album?.name || null
  const albumId = typeof t.album === 'string' ? null : t.album?.id || null
  if (!t.title) return null
  return {
    id: t.id, title: t.title || 'Unknown Track',
    artist: t.artists?.map(a => a.name).join(', ') || t.artist || 'Unknown Artist',
    artist_id: t.artists?.[0]?.id || null,
    album: albumName || 'Unknown Album', album_id: albumId,
    artwork_url: t.thumbnail || t.artwork_url || null,
    url: `https://open.spotify.com/track/${id}`, duration_ms: t.duration_ms || 0,
    isrc: t.isrc || t.external_ids?.isrc || null,
  }
}

// Official API track fetch
async function officialTrack(context, id) {
  const official = await officialFetch(context, `/tracks/${id}`)
  if (!official) return null
  return {
    id: official.id, title: official.name || 'Unknown Track',
    artist: official.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
    artist_id: official.artists?.[0]?.id || null,
    album: official.album?.name || 'Unknown Album', album_id: official.album?.id || null,
    artwork_url: official.album?.images?.[0]?.url || null,
    url: official.external_urls?.spotify || `https://open.spotify.com/track/${id}`, duration_ms: official.duration_ms || 0,
    isrc: official.external_ids?.isrc || null,
  }
}

// Handle track by racing multiple fast sources in parallel
async function handleTrack(context, id) {
  // Try sources with best artwork first (WolfX, Official), race them
  const fastResult = await raceSources([
    () => wolfxTrack(id),
    () => officialTrack(context, id),
  ], 3000)

  if (fastResult && fastResult.artwork_url) return jsonOk(fastResult)
  if (fastResult) {
    // Try oEmbed as backup — it may have artwork even if WolfX/Official didn't
    const oembed = await oEmbedTrack(context, id)
    if (oembed && oembed.artwork_url) return jsonOk({ ...fastResult, artwork_url: oembed.artwork_url })
    return jsonOk(fastResult)
  }

  // Fallback: oEmbed (fast but may lack artwork)
  const oembedResult = await oEmbedTrack(context, id)
  if (oembedResult) return jsonOk(oembedResult)

  // Final fallback: full embed scrape (more reliable but slower)
  const embedResult = await handleEmbedScrape(context, `https://open.spotify.com/track/${id}`, false)
  if (embedResult.status === 200) return embedResult

  return jsonError('Track not found', 404)
}

async function handleOfficialCollection(context, kind, id) {
  const token = await getSpotifyToken(context)
  if (!token) return null

  if (kind === 'playlist') {
    const res = await fetch(`https://api.spotify.com/v1/playlists/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: abortTimeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const tracks = (data.tracks?.items || [])
      .filter(item => item.track)
      .map(item => {
        const t = item.track
        const albumName = t.album?.name || 'Unknown Album'
        const artworkUrl = t.album?.images?.[0]?.url || null
        return {
          title: t.name || 'Unknown Track',
          artist: (t.artists || []).map(a => a.name).join(', ') || 'Unknown Artist',
          album: albumName,
          artwork_url: artworkUrl,
          url: `https://open.spotify.com/track/${t.id}`,
          type: 'track',
        }
      })
    return jsonOk({
      type: 'collection',
      collection_name: data.name || 'Unknown',
      collection_artwork: data.images?.[0]?.url || null,
      collection_type: 'playlist',
      tracks,
    })
  }

  if (kind === 'album') {
    const res = await fetch(`https://api.spotify.com/v1/albums/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: abortTimeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const tracks = (data.tracks?.items || []).map(t => ({
      title: t.name || 'Unknown Track',
      artist: (t.artists || []).map(a => a.name).join(', ') || data.artists?.[0]?.name || 'Unknown Artist',
      album: data.name || 'Unknown Album',
      artwork_url: null,
      url: `https://open.spotify.com/track/${t.id}`,
      type: 'track',
    }))
    return jsonOk({
      type: 'collection',
      collection_name: data.name || 'Unknown',
      collection_artwork: data.images?.[0]?.url || null,
      collection_type: 'album',
      tracks,
    })
  }

  return null
}

async function handleTestCredentials(context) {
  const hasId = !!context.env.VITE_SPOTIFY_CLIENT_ID
  const hasSecret = !!context.env.SPOTIFY_CLIENT_SECRET
  if (!hasId || !hasSecret) {
    return jsonOk({ ok: false, hasId, hasSecret, error: 'Missing env vars' })
  }
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(context.env.VITE_SPOTIFY_CLIENT_ID + ':' + context.env.SPOTIFY_CLIENT_SECRET),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: abortTimeout(10000),
    })
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = null }
    return jsonOk({
      ok: res.ok,
      status: res.status,
      hasId,
      hasSecret,
      error: data?.error || data?.error_description || (res.ok ? null : `HTTP ${res.status}`),
      hint: data?.error === 'invalid_client' ? 'Check your Client ID and Secret - they may be wrong' : undefined,
    })
  } catch (err) {
    return jsonOk({ ok: false, hasId, hasSecret, error: err.message })
  }
}

async function handleNewReleases(context, limit = 20) {
  const token = await getSpotifyToken(context)
  if (!token) return jsonError('No Spotify token available', 401)
  const res = await fetch(
    `https://api.spotify.com/v1/browse/new-releases?limit=${limit}&market=EG`,
    { headers: { 'Authorization': `Bearer ${token}` }, signal: abortTimeout(10000) }
  )
  if (!res.ok) return jsonError('Failed to fetch new releases', res.status)
  const data = await res.json()
  const albums = (data.albums?.items || []).map(a => ({
    id: a.id, name: a.name, artist: a.artists?.map(ar => ar.name).join(', ') || '',
    image: a.images?.[0]?.url || null, year: a.release_date?.slice(0, 4) || null,
    url: a.external_urls?.spotify || `https://open.spotify.com/album/${a.id}`,
    type: a.album_type || 'album', total_tracks: a.total_tracks || 0,
  }))
  return jsonOk({ albums })
}

async function handleRecentlyPlayed(context, limit = 20) {
  const token = await getSpotifyToken(context)
  if (!token) return jsonError('No Spotify token available', 401)
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`,
    { headers: { 'Authorization': `Bearer ${token}` }, signal: abortTimeout(10000) }
  )
  if (!res.ok) return jsonError('Failed to fetch recently played', res.status)
  const data = await res.json()
  const tracks = (data.items || []).map(item => {
    const t = item.track
    if (!t) return null
    return {
      id: t.id, title: t.name || 'Unknown Track',
      artist: t.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
      artist_id: t.artists?.[0]?.id || null,
      album: t.album?.name || 'Unknown Album', album_id: t.album?.id || null,
      artwork_url: t.album?.images?.[0]?.url || null,
      url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
      duration_ms: t.duration_ms || 0, played_at: item.played_at || null,
      isrc: t.external_ids?.isrc || null,
    }
  }).filter(Boolean)
  return jsonOk({ tracks })
}

async function handleCategories(context, limit = 50) {
  const token = await getSpotifyToken(context)
  if (!token) return jsonError('No Spotify token available', 401)
  const res = await fetch(
    `https://api.spotify.com/v1/browse/categories?limit=${limit}&locale=en_US`,
    { headers: { 'Authorization': `Bearer ${token}` }, signal: abortTimeout(10000) }
  )
  if (!res.ok) return jsonError('Failed to fetch categories', res.status)
  const data = await res.json()
  const categories = (data.categories?.items || []).map(c => ({
    id: c.id, name: c.name, image: c.icons?.[0]?.url || null,
  }))
  return jsonOk({ categories })
}

async function handleCategoryPlaylists(context, categoryId, limit = 20) {
  const token = await getSpotifyToken(context)
  if (!token) return jsonError('No Spotify token available', 401)
  const res = await fetch(
    `https://api.spotify.com/v1/browse/categories/${categoryId}/playlists?limit=${limit}&market=EG`,
    { headers: { 'Authorization': `Bearer ${token}` }, signal: abortTimeout(10000) }
  )
  if (!res.ok) return jsonError('Failed to fetch category playlists', res.status)
  const data = await res.json()
  const playlists = (data.playlists?.items || []).map(p => ({
    id: p.id, name: p.name, description: p.description || '',
    image: p.images?.[0]?.url || null, owner: p.owner?.display_name || 'Spotify',
    trackCount: p.tracks?.total || 0,
  }))
  return jsonOk({ playlists })
}

async function handleRecommendations(context, seedArtists, seedTracks, seedGenres, limit = 20) {
  const token = await getSpotifyToken(context)
  if (!token) return jsonError('No Spotify token available', 401)
  const params = new URLSearchParams({ limit })
  if (seedArtists?.length) params.set('seed_artists', seedArtists.slice(0, 5).join(','))
  if (seedTracks?.length) params.set('seed_tracks', seedTracks.slice(0, 5).join(','))
  if (seedGenres?.length) params.set('seed_genres', seedGenres.slice(0, 5).join(','))
  const res = await fetch(
    `https://api.spotify.com/v1/recommendations?${params.toString()}`,
    { headers: { 'Authorization': `Bearer ${token}` }, signal: abortTimeout(10000) }
  )
  if (!res.ok) return jsonError('Failed to fetch recommendations', res.status)
  const data = await res.json()
  const tracks = (data.tracks || []).map(t => ({
    id: t.id, title: t.name || 'Unknown Track',
    artist: t.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
    artist_id: t.artists?.[0]?.id || null,
    album: t.album?.name || 'Unknown Album', album_id: t.album?.id || null,
    artwork_url: t.album?.images?.[0]?.url || null,
    url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
    duration_ms: t.duration_ms || 0,
    isrc: t.external_ids?.isrc || null,
  }))
  return jsonOk({ tracks })
}

async function handleShow(context, id) {
  const token = await getSpotifyToken(context)
  if (!token) return jsonError('No Spotify token available', 401)
  const [showData, episodesData] = await Promise.all([
    officialFetch(context, `/shows/${id}`),
    officialFetch(context, `/shows/${id}/episodes?limit=20&market=EG`),
  ])
  if (!showData) return jsonError('Show not found', 404)
  const show = {
    id: showData.id, name: showData.name, description: showData.description,
    publisher: showData.publisher, image: showData.images?.[0]?.url || null,
    total_episodes: showData.total_episodes, explicit: showData.explicit,
    media_type: showData.media_type,
  }
  const episodes = (episodesData?.items || []).map(e => ({
    id: e.id, title: e.name, description: e.description,
    audio_preview_url: e.audio_preview_url, duration_ms: e.duration_ms,
    image: e.images?.[0]?.url || show.image, release_date: e.release_date,
    explicit: e.explicit,
  }))
  return jsonOk({ show, episodes })
}

async function handleEpisode(context, id) {
  const token = await getSpotifyToken(context)
  if (!token) return jsonError('No Spotify token available', 401)
  const data = await officialFetch(context, `/episodes/${id}`)
  if (!data) return jsonError('Episode not found', 404)
  return jsonOk({
    id: data.id, title: data.name, description: data.description,
    audio_preview_url: data.audio_preview_url, duration_ms: data.duration_ms,
    image: data.images?.[0]?.url || null, release_date: data.release_date,
    explicit: data.explicit,
    show: data.show ? {
      id: data.show.id, name: data.show.name, publisher: data.show.publisher,
      image: data.show.images?.[0]?.url || null,
    } : null,
  })
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function jsonOk(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function jsonError(msg, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS })
  }
  try {
    const body = await context.request.json()
    if (body.action === 'search') return await handleSearch(context, body.query, body.types || 'track,artist,album,playlist', body.limit || 10)
    if (body.action === 'artist') return await handleArtist(context, body.id)
    if (body.action === 'track') return await handleTrack(context, body.id)
    if (body.action === 'new-releases') return await handleNewReleases(context, body.limit || 20)
    if (body.action === 'recently-played') return await handleRecentlyPlayed(context, body.limit || 20)
    if (body.action === 'categories') return await handleCategories(context, body.limit || 50)
    if (body.action === 'category-playlists') return await handleCategoryPlaylists(context, body.categoryId, body.limit || 20)
    if (body.action === 'recommendations') return await handleRecommendations(context, body.seed_artists, body.seed_tracks, body.seed_genres, body.limit || 20)
    if (body.action === 'show') return await handleShow(context, body.id)
    if (body.action === 'episode') return await handleEpisode(context, body.id)
    if (body.action === 'test-credentials') return await handleTestCredentials(context)
    if (body.action === 'test-playlist') {
      const token = await getSpotifyToken(context)
      const id = body.id
      const kind = body.kind || 'playlist'
      const url = `https://api.spotify.com/v1/${kind === 'album' ? 'albums' : 'playlists'}/${id}`
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: abortTimeout(10000),
      })
      const text = await res.text()
      return jsonOk({ ok: res.ok, url, status: res.status, hasToken: !!token, body: text?.slice(0, 500) })
    }

    // Partner API actions (merged from spotify-partner.js)
    if (body.action === 'get-token') {
      const token = await getPartnerToken()
      return jsonOk(token)
    }
    if (body.action === 'query') {
      const { operationName, variables, playerToken } = body
      let token = playerToken
      if (!token) { const td = await getPartnerToken(); token = td.accessToken }
      const result = await partnerQuery(operationName, variables, token)
      return jsonOk(result)
    }
    if (body.action === 'user-library') {
      const token = body.playerToken || body.oauthToken
      if (!token) return jsonError('Missing token', 400)
      const result = await partnerQuery('libraryV3', {
        filters: [], order: null, textFilter: '', features: ['LIKED_SONGS', 'YOUR_EPISODES', 'PRERELEASES'],
        limit: 50, offset: 0, flatten: false, expandedFolders: [], folderUri: null, includeFoldersWhenFlattening: true,
      }, token)
      return jsonOk(result)
    }
    if (body.action === 'saved-tracks') {
      const token = body.playerToken || body.oauthToken
      if (!token) return jsonError('Missing token', 400)
      const result = await partnerQuery('fetchLibraryTracks', { offset: body.offset || 0, limit: body.limit || 50 }, token)
      return jsonOk(result)
    }
    if (body.action === 'partner-search') {
      const { query: searchTerm, limit, offset, playerToken } = body
      let token = playerToken
      if (!token) { const td = await getPartnerToken(); token = td.accessToken }
      const result = await partnerQuery('searchDesktop', {
        searchTerm, offset: offset || 0, limit: limit || 10, numberOfTopResults: 5,
        includeAudiobooks: true, includeArtistHasConcertsField: false, includePreReleases: true, includeLocalConcertsField: false,
      }, token)
      return jsonOk(result)
    }
    if (body.action === 'partner-playlist') {
      const { playlistId, limit, offset, playerToken } = body
      let token = playerToken
      if (!token) { const td = await getPartnerToken(); token = td.accessToken }
      const result = await partnerQuery('fetchPlaylist', {
        uri: `spotify:playlist:${playlistId}`, offset: offset || 0, limit: limit || 100, enableWatchFeedEntrypoint: false,
      }, token)
      return jsonOk(result)
    }
    if (body.action === 'partner-track') {
      const { trackId, playerToken } = body
      let token = playerToken
      if (!token) { const td = await getPartnerToken(); token = td.accessToken }
      const result = await partnerQuery('getTrack', { uri: `spotify:track:${trackId}` }, token)
      return jsonOk(result)
    }
    if (body.action === 'test-token') {
      const { token: testToken } = body
      if (!testToken) return jsonError('No token provided', 400)
      try {
        const hashes = await getHashes()
        return jsonOk({ ok: true, hashCount: Object.keys(hashes).length, hashes })
      } catch (e) {
        return jsonOk({ ok: true, error: e.message })
      }
    }

    let kind = null, id = null
    for (const [k, pattern] of Object.entries(SPOTIFY_PATTERNS)) {
      const m = pattern.exec(body.url)
      if (m) { kind = k; id = m[1]; break }
    }
    if ((kind === 'playlist' || kind === 'album') && !body.summary) {
      // Race official API + embeds for collections
      const official = await handleOfficialCollection(context, kind, id)
      if (official) return official
    }
    return await handleEmbedScrape(context, body.url, body.summary)
  } catch (err) {
    return jsonError(err.message)
  }
}
