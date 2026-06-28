import { json, error, handleOptions, requireAdmin } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') return handleOptions()
  if (context.request.method !== 'PATCH') return error('Method not allowed', 405)

  try {
    await requireAdmin(context, context.env.DB)
    const db = context.env.DB
    const userId = context.params.user_id as string

    const body = await context.request.json() as any
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first()
    if (!user) return error('User not found', 404)

    if (body.is_active !== undefined) {
      await db.prepare('UPDATE users SET is_active = ? WHERE id = ?')
        .bind(body.is_active ? 1 : 0, userId).run()
    }

    return json({ ok: true })
  } catch (e: any) {
    if (e.message === 'Admin access required') return error(e.message, 403)
    if (e.message === 'Not authenticated') return error(e.message, 401)
    return error(e.message || 'Failed to update user', 400)
  }
}
