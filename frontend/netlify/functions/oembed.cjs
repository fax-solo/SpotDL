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
    const { url } = JSON.parse(event.body)
    if (!url) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing url' }) }
    }

    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
    const res = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: `oEmbed returned ${res.status}` }) }
    }

    const data = await res.json()

    return {
      statusCode: 200,
      body: JSON.stringify({
        title: data.title || 'Unknown',
        image: data.thumbnail_url || null,
        author: data.author_name || 'Spotify',
      }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
