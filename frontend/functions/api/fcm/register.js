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
export async function onRequest(context) {
  const { request, env } = context

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const headers = { 'Content-Type': 'application/json' }

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
    if (!env.DB) {
      console.warn('FCM register: DB binding not available')
      return new Response(JSON.stringify({ error: 'Service unavailable' }), { status: 503, headers })
    }
    await env.DB.prepare(
      `INSERT OR REPLACE INTO push_tokens (user_id, token, updated_at)
       VALUES (?, ?, datetime('now'))`
    ).bind(userId, pushToken).run()

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers })
  }
}

async function getUserIdFromToken(token, env) {
  if (!token) return null
  try {
    const { verifyToken } = await import('../_lib/auth')
    const userId = await verifyToken(token, env.JWT_SECRET, env.DB)
    return userId
  } catch {
    return null
  }
}
