import { json, error, requireAdmin } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (context.request.method !== 'PATCH') {
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

  const userId = context.params.id as string

  let body: any
  try {
    body = await context.request.json()
  } catch {
    return error('Invalid JSON body', 400)
  }

  if (body.is_active === undefined || typeof body.is_active !== 'boolean') {
    return error('is_active (boolean) is required', 400)
  }

  if (userId === admin.id) {
    return error('Cannot modify yourself', 400)
  }

  const db = context.env.DB
  const existing: any = await db.prepare(
    'SELECT id, role FROM users WHERE id = ?'
  ).bind(userId).first()

  if (!existing) {
    return error('User not found', 404)
  }

  if (existing.role === 'admin') {
    return error('Cannot modify another admin', 400)
  }

  await db.prepare(
    'UPDATE users SET is_active = ? WHERE id = ?'
  ).bind(body.is_active ? 1 : 0, userId).run()

  return json({ ok: true, is_active: body.is_active })
}
