import { json, error, requireUser } from '../_lib'
import type { RouteHandler } from '../_lib'

const JWT_EXPIRY_SECONDS = 72 * 3600

function extractJti(token: string): string | null {
  const colonParts = token.split(':')
  if (colonParts.length === 4) return colonParts[2]

  const dotParts = token.split('.')
  if (dotParts.length === 3) {
    try {
      const payload = JSON.parse(atob(dotParts[1]))
      return payload.jti || null
    } catch {}
  }

  return null
}

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method !== 'POST') return error('Method not allowed', 405)

  try {
    await requireUser(context, context.env.DB)

    const auth = context.request.headers.get('Authorization')
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice(7)
      const jti = extractJti(token)
      if (jti) {
        const expiresAt = Math.floor(Date.now() / 1000) + JWT_EXPIRY_SECONDS
        await context.env.DB.prepare(
          'INSERT OR IGNORE INTO token_blacklist (jti, expires_at) VALUES (?, ?)'
        ).bind(jti, expiresAt).run()
      }
    }

    return json({ ok: true })
  } catch (e: any) {
    if (e.message === 'Not authenticated') return error(e.message, 401)
    return error(e.message || 'Logout failed', 400)
  }
}
