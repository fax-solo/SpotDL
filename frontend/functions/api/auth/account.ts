import { json, error, requireUser } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  if (context.request.method !== 'DELETE') {
    return error('Method not allowed', 405)
  }

  let user: any
  try {
    user = await requireUser(context, context.env.DB)
  } catch (e: any) {
    const msg = e.message || 'Not authenticated'
    return error(msg, msg === 'Not authenticated' ? 401 : 403)
  }

  if (user.role === 'admin') {
    return error('Admin accounts cannot be deleted via this endpoint', 403)
  }

  const db = context.env.DB

  await db.prepare('DELETE FROM push_tokens WHERE user_id = ?').bind(user.id).run()
  await db.prepare('DELETE FROM history WHERE user_id = ?').bind(user.id).run()
  await db.prepare('DELETE FROM download_logs WHERE user_id = ?').bind(user.id).run()
  await db.prepare('DELETE FROM admin_logs WHERE admin_id = ?').bind(user.id).run()
  await db.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run()

  return json({ ok: true, message: 'Account and all associated data permanently deleted' })
}
