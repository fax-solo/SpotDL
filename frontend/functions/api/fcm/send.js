/**
 * POST /api/fcm/send
 *
 * Sends a push notification to a specific user via Firebase Cloud Messaging v1 API.
 *
 * Requires:
 *   FCM_SERVICE_ACCOUNT — JSON string of the Firebase service account key
 *   FCM_API_KEY         — a random secret for server-to-server auth (x-api-key header)
 *
 * Body: { userId: string, title: string, body: string, data?: object }
 */
export async function onRequestPost(context) {
  const { request, env } = context

  const origin = request.headers.get('Origin') || ''
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : ['']

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : '',
        'Vary': 'Origin',
      },
    })
  }

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : '',
    'Vary': 'Origin',
  }

  // Verify API key
  const apiKey = request.headers.get('x-api-key')
  if (!apiKey || apiKey !== env.FCM_API_KEY) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers })
  }

  try {
    const { userId, title, body, data } = await request.json()
    if (!userId || !title) {
      return new Response(JSON.stringify({ error: 'Missing userId or title' }), { status: 400, headers })
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'D1 not configured' }), { status: 500, headers })
    }

    // Get all push tokens for this user
    const tokens = await env.DB.prepare(
      `SELECT token FROM push_tokens WHERE user_id = ?`
    ).bind(userId).all()

    if (!tokens.results?.length) {
      return new Response(JSON.stringify({ error: 'No tokens found for user' }), { status: 404, headers })
    }

    // Get FCM access token from service account
    const accessToken = await getFcmAccessToken(env)
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'FCM not configured' }), { status: 500, headers })
    }

    const projectId = getProjectId(env)

    const results = []
    for (const row of tokens.results) {
      try {
        const fcmRes = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              message: {
                token: row.token,
                notification: { title, body },
                data: data || {},
              },
            }),
          }
        )
        const fcmResult = await fcmRes.json()
        results.push({ token: row.token.slice(0, 20) + '...', success: fcmRes.ok, fcmResult })
      } catch (err) {
        results.push({ token: row.token.slice(0, 20) + '...', success: false, error: err.message })
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), { status: 200, headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers })
  }
}

function getProjectId(env) {
  try {
    const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT || '{}')
    return sa.project_id || 'sinc-9088a'
  } catch {
    return 'sinc-9088a'
  }
}

/**
 * Gets an OAuth2 access token for FCM from the service account.
 * Uses the JWT bearer grant flow.
 */
async function getFcmAccessToken(env) {
  const saJson = env.FCM_SERVICE_ACCOUNT
  if (!saJson) return null

  let sa
  try {
    sa = JSON.parse(saJson)
  } catch {
    return null
  }

  const { private_key, client_email, token_uri } = sa
  if (!private_key || !client_email) return null

  const now = Math.floor(Date.now() / 1000)
  const jwtHeader = { alg: 'RS256', typ: 'JWT' }
  const jwtPayload = {
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: token_uri || 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const base64Url = (obj) => {
    const bytes = new TextEncoder().encode(JSON.stringify(obj))
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  const signingInput = `${base64Url(jwtHeader)}.${base64Url(jwtPayload)}`

  // Import the RSA private key
  const pemToBinary = (pem) => {
    const b64 = pem
      .replace(/-----BEGIN [\w\s]+ KEY-----/g, '')
      .replace(/-----END [\w\s]+ KEY-----/g, '')
      .replace(/\s/g, '')
    const binaryString = atob(b64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      pemToBinary(private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const signature = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      cryptoKey,
      new TextEncoder().encode(signingInput)
    )

    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    const jwt = `${signingInput}.${sigB64}`

    // Exchange JWT for access token
    const tokenRes = await fetch(token_uri || 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    })

    const tokenData = await tokenRes.json()
    return tokenData.access_token || null
  } catch (err) {
    console.error('[fcm] Token exchange failed:', err)
    return null
  }
}
