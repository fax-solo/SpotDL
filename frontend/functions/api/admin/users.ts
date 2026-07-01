import { json, error, requireAdmin } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {

  try {
    await requireAdmin(context, context.env.DB)
    const db = context.env.DB

    // GET /api/admin/users - list all users
    if (context.request.method === 'GET') {
      const users = await db.prepare(
        'SELECT id, username, email, display_name, avatar_path, role, auth_provider, is_guest, is_active, created_at, last_active FROM users ORDER BY created_at DESC'
      ).all()

      const total = await db.prepare('SELECT COUNT(*) as c FROM users').first()

      return json({
        users: users.results.map((u: any) => ({
          ...u,
          avatar_url: u.avatar_path ? `/api/avatars/${u.avatar_path}` : null,
          is_guest: Boolean(u.is_guest),
          is_active: Boolean(u.is_active),
        })),
        total: (total as any)?.c || 0,
      })
    }

    return error('Method not allowed', 405)
  } catch (e: any) {
    if (e.message === 'Admin access required') return error(e.message, 403)
    if (e.message === 'Not authenticated') return error(e.message, 401)
    return error(e.message || 'Failed to fetch users', 400)
  }
}
