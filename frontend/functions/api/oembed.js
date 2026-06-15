const SPOTIFY_PATTERNS = {
  track: /spotify\.com\/track\/([a-zA-Z0-9]+)/,
  album: /spotify\.com\/album\/([a-zA-Z0-9]+)/,
  playlist: /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { url } = await context.request.json()
    if (!url) {
      return new Response(JSON.stringify({ error: 'Missing url' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
    const res = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `oEmbed returned ${res.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const data = await res.json()

    return new Response(JSON.stringify({
      title: data.title || 'Unknown',
      image: data.thumbnail_url || null,
      author: data.author_name || 'Spotify',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
