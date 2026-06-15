function randomHex(bytes) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes))
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function onRequest(context) {
  const CLIENT_ID = context.env.VITE_SPOTIFY_CLIENT_ID || context.env.SPOTIFY_CLIENT_ID
  const CLIENT_SECRET = context.env.SPOTIFY_CLIENT_SECRET || ''

  if (!CLIENT_ID) {
    console.error('Missing VITE_SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_ID environment variable')
  }

  const url = new URL(context.request.url)
  const params = Object.fromEntries(url.searchParams)
  const { action, origin } = params

  if (action === 'login') {
    if (!origin) {
      return new Response(JSON.stringify({ error: 'Missing origin' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const state = randomHex(16)
    const redirectUri = `${origin}/callback`

    const authorizeUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
      scope: 'user-read-private user-read-email user-read-recently-played user-top-read playlist-read-private playlist-read-collaborative',
    })

    return new Response(null, {
      status: 302,
      headers: { Location: authorizeUrl },
    })
  }

  if (context.request.method === 'POST') {
    let body = {}
    try {
      body = await context.request.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { code, redirect_uri: redirectUri, refresh_token: refreshToken } = body

    if (refreshToken) {
      try {
        const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
        })

        if (!tokenRes.ok) {
          return new Response(JSON.stringify({ error: 'Token refresh failed' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const tokens = await tokenRes.json()
        return new Response(JSON.stringify({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || refreshToken,
          expires_in: tokens.expires_in,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    if (!code || !redirectUri) {
      return new Response(JSON.stringify({ error: 'Missing code or redirect_uri' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: 'SPOTIFY_CLIENT_SECRET not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    try {
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`),
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      })

      if (!tokenRes.ok) {
        const errText = await tokenRes.text().catch(() => 'unknown')
        return new Response(JSON.stringify({ error: 'Token exchange failed', detail: errText }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const tokens = await tokenRes.json()
      return new Response(JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || '',
        expires_in: tokens.expires_in,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response(JSON.stringify({ error: 'Invalid request' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
}
