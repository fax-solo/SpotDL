const SPOTIFY_PATTERNS = {
  track: /spotify\.com\/track\/([a-zA-Z0-9]+)/,
  album: /spotify\.com\/album\/([a-zA-Z0-9]+)/,
  playlist: /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const { url, summary } = JSON.parse(event.body)
    if (!url) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing url' }) }
    }

    let kind = null
    let id = null
    for (const [k, pattern] of Object.entries(SPOTIFY_PATTERNS)) {
      const m = pattern.exec(url)
      if (m) { kind = k; id = m[1]; break }
    }

    if (!kind || !id) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid Spotify URL' }) }
    }

    const embedUrl = `https://open.spotify.com/embed/${kind}/${id}`
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      },
    })

    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: `Spotify embed returned ${res.status}` }) }
    }

    const html = await res.text()
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/)
    if (!match) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Could not find embed data' }) }
    }

    const data = JSON.parse(match[1])
    const entity = data?.props?.pageProps?.state?.data?.entity

    if (!entity) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Unexpected embed JSON structure' }) }
    }

    if (summary && kind !== 'track') {
      return {
        statusCode: 200,
        body: JSON.stringify({
          id,
          name: entity.title || 'Unknown',
          image: extractImage(entity),
          track_count: (entity.trackList || []).length,
          owner: entity.ownerName || entity.subtitle || 'Spotify',
          description: entity.description || '',
        }),
      }
    }

    if (kind === 'track') {
      const artistName = entity.artists
        ? entity.artists.map(a => a.name).join(', ')
        : entity.subtitle || 'Unknown Artist'
      return {
        statusCode: 200,
        body: JSON.stringify({
          type: 'track',
          title: entity.title || 'Unknown Track',
          artist: artistName,
          album: 'Single',
          artwork_url: extractImage(entity),
          url: `https://open.spotify.com/track/${id}`,
        }),
      }
    }

    const trackList = entity.trackList || []
    const collectionType = entity.type === 'album' ? 'album' : 'playlist'
    const collectionArtwork = extractImage(entity)
    const isAlbum = kind === 'album'

    const tracks = trackList
      .filter(item => item.uri && item.uri.startsWith('spotify:track:'))
      .map(item => {
        const tid = item.uri.split(':')[2]
        const trackArtwork = extractTrackImage(item) || collectionArtwork
        const trackAlbum = extractTrackAlbum(item) || (isAlbum ? entity.title : 'Unknown Album')
        return {
          title: item.title || 'Unknown Track',
          artist: item.subtitle || 'Unknown Artist',
          album: trackAlbum,
          artwork_url: trackArtwork,
          url: `https://open.spotify.com/track/${tid}`,
          type: 'track',
        }
      })

    return {
      statusCode: 200,
      body: JSON.stringify({
        type: 'collection',
        collection_name: entity.title || 'Unknown',
        collection_artwork: collectionArtwork,
        collection_type: collectionType,
        tracks,
      }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    }
  }
}

function extractImage(entity) {
  try {
    const sources = entity.coverArt?.sources || []
    if (sources.length) {
      sources.sort((a, b) => (b.width || 0) - (a.width || 0))
      return sources[0].url
    }
  } catch {}
  // Track embeds use visualIdentity.image instead of coverArt
  try {
    const images = entity.visualIdentity?.image || []
    if (images.length) {
      images.sort((a, b) => (b.maxHeight || 0) - (a.maxHeight || 0))
      return images[0].url
    }
  } catch {}
  return null
}

function extractTrackImage(item) {
  for (const key of ['coverArt', 'albumOfTrack', 'album']) {
    try {
      const sub = item[key]
      if (!sub) continue
      const sources = sub.coverArt?.sources || sub.sources || []
      if (sources.length) {
        sources.sort((a, b) => (b.width || 0) - (a.width || 0))
        return sources[0].url
      }
    } catch {}
  }
  return null
}

function extractTrackAlbum(item) {
  for (const key of ['album', 'albumOfTrack']) {
    try {
      const album = item[key]
      if (album?.name) return album.name
    } catch {}
  }
  return null
}
