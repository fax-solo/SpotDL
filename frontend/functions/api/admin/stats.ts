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

  const db = context.env.DB
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().replace('T', 'T')

  const count = async (sql: string, ...params: any[]) => {
    const row: any = await db.prepare(sql).bind(...params).first()
    return row?.count ?? 0
  }

  const total_users = await count('SELECT COUNT(*) as count FROM users')
  const total_guests = await count('SELECT COUNT(*) as count FROM users WHERE is_guest = 1')
  const total_email_users = await count("SELECT COUNT(*) as count FROM users WHERE auth_provider = 'email'")
  const total_google_users = await count("SELECT COUNT(*) as count FROM users WHERE auth_provider = 'google'")
  const active_this_month = await count('SELECT COUNT(*) as count FROM users WHERE last_active >= ?', monthStart)
  const new_this_month = await count('SELECT COUNT(*) as count FROM users WHERE created_at >= ?', monthStart)
  const total_downloads = await count('SELECT COUNT(*) as count FROM download_logs')
  const downloads_this_month = await count('SELECT COUNT(*) as count FROM download_logs WHERE timestamp >= ?', monthStart)
  const guest_downloads = await count('SELECT COUNT(*) as count FROM download_logs WHERE is_guest = 1 AND timestamp >= ?', monthStart)
  const user_downloads = await count('SELECT COUNT(*) as count FROM download_logs WHERE is_guest = 0 AND timestamp >= ?', monthStart)

  const sourceRows = await db.prepare(
    'SELECT source, COUNT(*) as count FROM download_logs WHERE timestamp >= ? AND source IS NOT NULL GROUP BY source'
  ).bind(monthStart).all()
  const downloads_by_source: Record<string, number> = {}
  for (const row of sourceRows.results || []) {
    downloads_by_source[(row as any).source] = (row as any).count
  }

  const last_7_days: { date: string; downloads: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().replace('T', 'T')
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString().replace('T', 'T')
    const c = await count(
      'SELECT COUNT(*) as count FROM download_logs WHERE timestamp >= ? AND timestamp < ?',
      dayStart, dayEnd
    )
    last_7_days.push({
      date: dayStart.slice(0, 10),
      downloads: c,
    })
  }

  return json({
    total_users,
    total_guests,
    total_email_users,
    total_google_users,
    active_this_month,
    new_this_month,
    total_downloads,
    downloads_this_month,
    guest_downloads,
    user_downloads,
    downloads_by_source,
    last_7_days,
  })
}
