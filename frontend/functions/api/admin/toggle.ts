import { json, error, requireAdmin } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (context.request.method !== 'POST') {
    return error('Method not allowed', 405)
  }

  let admin: any
  try {
    admin = await requireAdmin(context, context.env.DB)
  } catch (e: any) {
    if (e.message === 'Not authenticated' || e.message === 'Invalid or expired token' || e.message === 'User not found or disabled') {
      return error(e.message, 401)
    }
    if (e.message === 'Admin access required') {
      return error(e.message, 403)
    }
    throw e
  }

  let body: any
  try {
    body = await context.request.json()
  } catch {
    return error('Invalid JSON body', 400)
  }

  const { user_id, is_active } = body
  if (!user_id || typeof is_active !== 'boolean') {
    return error('Missing or invalid fields: user_id, is_active', 400)
  }

  const db = context.env.DB

  if (!is_active) {
    const target = await db.prepare(
      'SELECT role FROM users WHERE id = ?'
    ).bind(user_id).first() as { role: string } | null
    if (!target) return error('User not found', 404)
    if (target.role === 'admin') {
      return error('Cannot disable admin accounts', 403)
    }

    const adminCount = await db.prepare(
      "SELECT COUNT(*) as cnt FROM users WHERE role = 'admin' AND is_active = 1"
    ).first() as { cnt: number }
    if (adminCount.cnt <= 1) {
      return error('Cannot disable the last active admin', 403)
    }
  }

  const result = await db.prepare(
    'UPDATE users SET is_active = ? WHERE id = ?'
  ).bind(is_active ? 1 : 0, user_id).run()

  if ((result.meta?.changes ?? 0) === 0) {
    return error('User not found', 404)
  }

  return json({ ok: true })
}
