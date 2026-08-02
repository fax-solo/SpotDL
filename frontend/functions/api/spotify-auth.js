import { checkRateLimit } from './_lib/rate_limit'

function randomHex(bytes) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes))
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

const STATE_TTL_MS = 10 * 60 * 1000

export async function onRequest(context) {
  const CLIENT_ID = context.env.SPOTIFY_CLIENT_ID || context.env.VITE_SPOTIFY_CLIENT_ID
  const CLIENT_SECRET = context.env.SPOTIFY_CLIENT_SECRET || ''
  const DB = context.env.DB

  if (!CLIENT_ID) {
    console.error('Missing SPOTIFY_CLIENT_ID environment variable')
  }

  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown'
  if (DB) {
    try {
      const { allowed } = await checkRateLimit(DB, `auth:spotify:${ip}`, 30)
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'Too many requests. Try again later.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }
    } catch (e) {
      console.warn('Rate limit check failed:', e.message)
    }
  }

  const url = new URL(context.request.url)
  const params = Object.fromEntries(url.searchParams)
  const { action, origin, state: returnedState } = params

  if (action === 'login') {
    if (!origin) {
      return new Response(JSON.stringify({ error: 'Missing origin' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const state = randomHex(32)
    const redirectUri = `${origin}/callback`

    if (DB) {
      try {
        await DB.prepare(
          'INSERT INTO oauth_state (state, created_at) VALUES (?, ?)'
        ).bind(state, Date.now()).run()
      } catch (e) {
        console.warn('Failed to store oauth state in D1:', e.message)
      }
    }

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
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { code, redirect_uri: redirectUri, refresh_token: refreshToken, state } = body

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
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          })
        }

        const tokens = await tokenRes.json()
        return new Response(JSON.stringify({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || refreshToken,
          expires_in: tokens.expires_in,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      } catch (err) {
        console.warn('[spotify-auth] token exchange failed:', err)
        return new Response(JSON.stringify({ error: 'Token exchange failed' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }
    }

    if (!code || !redirectUri) {
      return new Response(JSON.stringify({ error: 'Missing code or redirect_uri' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    if (!state) {
      return new Response(JSON.stringify({ error: 'Missing state parameter' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    if (!DB) {
      return new Response(JSON.stringify({ error: 'Database unavailable for state verification' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    try {
      const stored = await DB.prepare(
        'SELECT created_at FROM oauth_state WHERE state = ?'
      ).bind(state).first()
      if (!stored) {
        return new Response(JSON.stringify({ error: 'Invalid state parameter — possible CSRF' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }
      if (Date.now() - stored.created_at > STATE_TTL_MS) {
        return new Response(JSON.stringify({ error: 'State parameter expired' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }
      await DB.prepare('DELETE FROM oauth_state WHERE state = ?').bind(state).run()
    } catch (e) {
      console.warn('State verification failed:', e.message)
      return new Response(JSON.stringify({ error: 'State verification failed' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    if (!CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: 'SPOTIFY_CLIENT_SECRET not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }

      const tokens = await tokenRes.json()
      return new Response(JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || '',
        expires_in: tokens.expires_in,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    } catch (err) {
      console.warn('[spotify-auth] refresh failed:', err)
      return new Response(JSON.stringify({ error: 'Token refresh failed' }), {
        status: err.message === 'Refresh token expired' ? 401 : 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
  }

  return new Response(JSON.stringify({ error: 'Invalid request' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
