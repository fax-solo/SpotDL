import { json, error, verifyToken } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (context.request.method !== 'POST') {
    return error('Method not allowed', 405)
  }

  const auth = context.request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return error('Not authenticated', 401)
  }

  const token = auth.slice(7)
  const userId = await verifyToken(token, context.env.JWT_SECRET, context.env.DB)
  if (!userId) {
    return error('Invalid or expired token', 401)
  }

  const parts = token.split('.')
  let jti: string | null = null
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1]))
      jti = payload.jti || null
    } catch {}
  }

  if (jti) {
    const expiresAt = Math.floor(Date.now() / 1000) + 72 * 3600
    const existing = await context.env.DB.prepare(
      'SELECT 1 FROM token_blacklist WHERE jti = ?'
    ).bind(jti).first()
    if (!existing) {
      await context.env.DB.prepare(
        'INSERT INTO token_blacklist (jti, expires_at) VALUES (?, ?)'
      ).bind(jti, expiresAt).run()
    }
  }

  const now = Math.floor(Date.now() / 1000)
  await context.env.DB.prepare(
    'DELETE FROM token_blacklist WHERE expires_at < ?'
  ).bind(now).run()

  return json({ ok: true })
}
