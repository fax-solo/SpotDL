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
    signal: abortTimeout(10000),
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
  for (let attempt = 0; attempt < 3; attempt++) {
    const ua = UAS[attempt % UAS.length]
    const res = await fetch(embedUrl, {
      headers: { 'User-Agent': ua, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: abortTimeout(15000),
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
        artwork_url: artwork || collectionArtwork,
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
    { headers: { 'Authorization': `Bearer ${token}` }, signal: abortTimeout(10000) }
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

async function handleTrack(context, id) {
  const data = await wolfxFetch(`/track/${id}`)
  if (data) {
    const t = data.track || data
    const albumName = typeof t.album === 'string' ? t.album : t.album?.name || null
    const albumId = typeof t.album === 'string' ? null : t.album?.id || null
    if (t.title && albumName) {
      return jsonOk({
        id: t.id, title: t.title || 'Unknown Track',
        artist: t.artists?.map(a => a.name).join(', ') || t.artist || 'Unknown Artist',
        artist_id: t.artists?.[0]?.id || null,
        album: albumName, album_id: albumId,
        artwork_url: t.thumbnail || t.artwork_url || null,
        url: `https://open.spotify.com/track/${id}`, duration_ms: t.duration_ms || 0,
      })
    }
  }

  const embedResult = await handleEmbedScrape(context, `https://open.spotify.com/track/${id}`, false)
  if (embedResult.status === 200) {
    const cloned = embedResult.clone()
    const parsed = await cloned.json()
    if (parsed.title && parsed.title !== 'Unknown Track') return embedResult
  }

  const official = await officialFetch(context, `/tracks/${id}`)
  if (official) {
    return jsonOk({
      id: official.id, title: official.name || 'Unknown Track',
      artist: official.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
      artist_id: official.artists?.[0]?.id || null,
      album: official.album?.name || 'Unknown Album', album_id: official.album?.id || null,
      artwork_url: official.album?.images?.[0]?.url || null,
      url: official.external_urls?.spotify || `https://open.spotify.com/track/${id}`, duration_ms: official.duration_ms || 0,
    })
  }

  try {
    const oembedRes = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent('https://open.spotify.com/track/' + id)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: abortTimeout(5000) }
    )
    if (oembedRes.ok) {
      const oembed = await oembedRes.json()
      return jsonOk({
        id, title: oembed.title || 'Unknown Track', artist: oembed.author_name || 'Unknown Artist',
        artist_id: null, album: 'Single', album_id: null, artwork_url: oembed.thumbnail_url || null,
        url: `https://open.spotify.com/track/${id}`, duration_ms: 0,
      })
    }
  } catch {}

  if (embedResult.status === 200) return embedResult
  return jsonError('Track not found', 404)
}

async function handleOfficialCollection(context, kind, id) {
  const token = await getSpotifyToken(context)
  if (!token) return null

  if (kind === 'playlist') {
    const res = await fetch(`https://api.spotify.com/v1/playlists/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: abortTimeout(10000),
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
      signal: abortTimeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const tracks = (data.tracks?.items || []).map(t => ({
      title: t.name || 'Unknown Track',
      artist: (t.artists || []).map(a => a.name).join(', ') || data.artists?.[0]?.name || 'Unknown Artist',
      album: data.name || 'Unknown Album',
      artwork_url: data.images?.[0]?.url || null,
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

    let kind = null, id = null
    for (const [k, pattern] of Object.entries(SPOTIFY_PATTERNS)) {
      const m = pattern.exec(body.url)
      if (m) { kind = k; id = m[1]; break }
    }
    if ((kind === 'playlist' || kind === 'album') && !body.summary) {
      const official = await handleOfficialCollection(context, kind, id)
      if (official) return official
    }
    return await handleEmbedScrape(context, body.url, body.summary)
  } catch (err) {
    return jsonError(err.message)
  }
}
