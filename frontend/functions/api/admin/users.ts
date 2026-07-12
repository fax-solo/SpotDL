import { json, error, requireAdmin } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (context.request.method !== 'GET') {
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

  const url = new URL(context.request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200)
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0)
  const q = url.searchParams.get('q') || ''

  const db = context.env.DB

  let whereClause = ''
  const params: any[] = []
  if (q) {
    const pattern = `%${q}%`
    whereClause = `WHERE (display_name LIKE ? OR email LIKE ? OR auth_provider LIKE ? OR id LIKE ?)`
    params.push(pattern, pattern, pattern, pattern)
  }

  const totalRow: any = await db.prepare(
    `SELECT COUNT(*) as count FROM users ${whereClause}`
  ).bind(...params).first()
  const total = totalRow?.count ?? 0

  const userRows = await db.prepare(
    `SELECT id, username, email, display_name, avatar_path, role, auth_provider, is_guest, created_at, last_active, is_active
     FROM users ${whereClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all()

  const users = (userRows.results || []).map((u: any) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    display_name: u.display_name,
    role: u.role,
    auth_provider: u.auth_provider,
    is_guest: Boolean(u.is_guest),
    created_at: u.created_at || null,
    last_active: u.last_active || null,
    is_active: Boolean(u.is_active),
  }))

  return json({ users, total })
}
