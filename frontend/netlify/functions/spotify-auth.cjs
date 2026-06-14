const crypto = require('crypto')

const CLIENT_ID = process.env.VITE_SPOTIFY_CLIENT_ID || process.env.SPOTIFY_CLIENT_ID || '9896a8bc854e4b5ea1ff42a4e63f75c6'
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || ''

exports.handler = async (event) => {
  const params = event.queryStringParameters || {}
  const { action, code, state, error } = params

  if (error) {
    return {
      statusCode: 302,
      headers: { Location: '/?error=spotify_auth_denied' },
      body: '',
    }
  }

  if (action === 'login') {
    const origin = params.origin
    if (!origin) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing origin parameter' }) }
    }

    const csrfToken = crypto.randomBytes(16).toString('hex')
    const statePayload = Buffer.from(JSON.stringify({ csrf: csrfToken, origin })).toString('base64url')
    const redirectUri = `${origin}/.netlify/functions/spotify-auth`

    const authorizeUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri,
      state: statePayload,
      scope: 'user-read-private user-read-email user-read-recently-played user-top-read playlist-read-private playlist-read-collaborative',
    })

    return {
      statusCode: 302,
      headers: {
        Location: authorizeUrl,
        'Set-Cookie': `spotify_csrf=${csrfToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=300`,
      },
      body: '',
    }
  }

  if (code && state) {
    let origin = '/'
    try {
      const parsed = JSON.parse(Buffer.from(state, 'base64url').toString())
      origin = parsed.origin || '/'
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid state parameter' }) }
    }

    const redirectUri = `${origin}/.netlify/functions/spotify-auth`

    if (!CLIENT_SECRET) {
      return {
        statusCode: 302,
        headers: { Location: `${origin}/?error=missing_client_secret` },
        body: '',
      }
    }

    try {
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      })

      if (!tokenRes.ok) {
        const errText = await tokenRes.text().catch(() => 'unknown error')
        return {
          statusCode: 302,
          headers: { Location: `${origin}/?error=token_exchange_failed` },
          body: '',
        }
      }

      const tokens = await tokenRes.json()
      const hashParams = new URLSearchParams({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || '',
        expires_in: String(tokens.expires_in),
      })

      return {
        statusCode: 302,
        headers: { Location: `${origin}/?${hashParams}` },
        body: '',
      }
    } catch {
      return {
        statusCode: 302,
        headers: { Location: `${origin}/?error=token_exchange_failed` },
        body: '',
      }
    }
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) }
}
