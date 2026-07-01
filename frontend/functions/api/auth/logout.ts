import { json, error, requireUser } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method !== 'POST') return error('Method not allowed', 405)

  try {
    await requireUser(context, context.env.DB)

    const auth = context.request.headers.get('Authorization')
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice(7)
      const parts = token.split(':')
      if (parts.length === 4) {
        const jti = parts[2]
        const expiresAt = Math.floor(Date.now() / 1000) + 72 * 3600
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
