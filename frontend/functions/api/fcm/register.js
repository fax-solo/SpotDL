/**
 * POST /api/fcm/register
 *
 * Registers a push notification token for a user.
 * Stores the token in D1 so the server can send push notifications.
 *
 * Body: { token: string }
 * Auth: Bearer token (user must be authenticated)
 *
 * Requires D1 binding named "DB" and FCM_VAPID_KEY secret.
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

  try {
    const { token: pushToken } = await request.json()

    if (!pushToken || typeof pushToken !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid token' }), { status: 400, headers })
    }

    const auth = request.headers.get('Authorization') || ''
    const token = auth.replace(/^Bearer\s+/i, '')

    // Validate auth token to get user ID
    const userId = await getUserIdFromToken(token, env)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })
    }

    // Store token in D1
    if (env.DB) {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO push_tokens (user_id, token, updated_at)
         VALUES (?, ?, datetime('now'))`
      ).bind(userId, pushToken).run()
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers })
  }
}

async function getUserIdFromToken(token, env) {
  if (!token) return null
  try {
    const { verifyToken } = await import('../_lib/auth.js')
    const payload = await verifyToken(token, env, null)
    return payload?.userId || null
  } catch {
    return null
  }
}
