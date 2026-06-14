const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '..', '.env')

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

const CLIENT_ID = process.env.VITE_SPOTIFY_CLIENT_ID || process.env.SPOTIFY_CLIENT_ID || '9896a8bc854e4b5ea1ff42a4e63f75c6'
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || ''

exports.handler = async (event) => {
  const params = event.queryStringParameters || {}
  const { action, origin } = params

  if (action === 'login') {
    if (!origin) return { statusCode: 400, body: JSON.stringify({ error: 'Missing origin' }) }

    const state = crypto.randomBytes(16).toString('hex')
    const redirectUri = `${origin}/callback`

    const authorizeUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
      scope: 'user-read-private user-read-email user-read-recently-played user-top-read playlist-read-private playlist-read-collaborative',
    })

    return {
      statusCode: 302,
      headers: { Location: authorizeUrl },
      body: '',
    }
  }

  if (event.httpMethod === 'POST') {
    let body = {}
    try {
      body = event.parsedBody || JSON.parse(event.body || '{}')
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
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
          return { statusCode: 502, body: JSON.stringify({ error: 'Token refresh failed' }) }
        }

        const tokens = await tokenRes.json()
        return {
          statusCode: 200,
          body: JSON.stringify({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || refreshToken,
            expires_in: tokens.expires_in,
          }),
        }
      } catch (err) {
        return { statusCode: 502, body: JSON.stringify({ error: err.message }) }
      }
    }

    if (!code || !redirectUri) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing code or redirect_uri' }) }
    }

    if (!CLIENT_SECRET) {
      return { statusCode: 500, body: JSON.stringify({ error: 'SPOTIFY_CLIENT_SECRET not configured' }) }
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
        const errText = await tokenRes.text().catch(() => 'unknown')
        return {
          statusCode: 502,
          body: JSON.stringify({ error: 'Token exchange failed', detail: errText }),
        }
      }

      const tokens = await tokenRes.json()
      return {
        statusCode: 200,
        body: JSON.stringify({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || '',
          expires_in: tokens.expires_in,
        }),
      }
    } catch (err) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: err.message }),
      }
    }
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) }
}
