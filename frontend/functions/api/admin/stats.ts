import { json, error, requireAdmin } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method !== 'GET') return error('Method not allowed', 405)

  try {
    await requireAdmin(context, context.env.DB)
    const db = context.env.DB

    const totalUsers = await db.prepare('SELECT COUNT(*) as c FROM users').first()
    const totalDownloads = await db.prepare('SELECT COUNT(*) as c FROM download_logs').first()

    // Last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const weekUsers = await db.prepare(
      "SELECT DATE(created_at) as day, COUNT(*) as count FROM users WHERE created_at >= ? GROUP BY day ORDER BY day"
    ).bind(weekAgo).all()
    const weekDownloads = await db.prepare(
      "SELECT DATE(timestamp) as day, COUNT(*) as count FROM download_logs WHERE timestamp >= ? GROUP BY day ORDER BY day"
    ).bind(weekAgo).all()

    // Source breakdown
    const sources = await db.prepare(
      'SELECT source, COUNT(*) as count FROM download_logs GROUP BY source'
    ).all()

    // Active users in last 7 days
    const activeUsers = await db.prepare(
      'SELECT COUNT(*) as c FROM users WHERE last_active >= ?'
    ).bind(weekAgo).first()

    // Auth provider breakdown
    const byProvider = await db.prepare(
      'SELECT auth_provider, COUNT(*) as count FROM users GROUP BY auth_provider'
    ).all()

    // Guest count
    const guestCount = await db.prepare('SELECT COUNT(*) as c FROM users WHERE is_guest = 1').first()
    const emailCount = await db.prepare("SELECT COUNT(*) as c FROM users WHERE auth_provider = 'email'").first()
    const googleCount = await db.prepare("SELECT COUNT(*) as c FROM users WHERE auth_provider = 'google'").first()

    // Build trend
    const trendMap: Record<string, number> = {}
    for (const row of weekDownloads.results as any[]) {
      trendMap[row.day] = row.count
    }
    const trend: { date: string; downloads: number; users: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10)
      const dlRow = (weekDownloads.results as any[]).find((r: any) => r.day === d)
      const uRow = (weekUsers.results as any[]).find((r: any) => r.day === d)
      trend.push({ date: d, downloads: dlRow?.count || 0, users: uRow?.count || 0 })
    }

    return json({
      total_users: (totalUsers as any)?.c || 0,
      total_downloads: (totalDownloads as any)?.c || 0,
      trend,
      sources: sources.results,
      active_users_last_7d: (activeUsers as any)?.c || 0,
      guests: (guestCount as any)?.c || 0,
      email_users: (emailCount as any)?.c || 0,
      google_users: (googleCount as any)?.c || 0,
      by_provider: byProvider.results,
    })
  } catch (e: any) {
    if (e.message === 'Admin access required') return error(e.message, 403)
    if (e.message === 'Not authenticated') return error(e.message, 401)
    return error(e.message || 'Failed to fetch stats', 400)
  }
}
