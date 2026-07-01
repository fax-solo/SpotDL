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

    const last7Days: { date: string; downloads: number; users: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10)
      const dlRow = (weekDownloads.results as any[]).find((r: any) => r.day === d)
      const uRow = (weekUsers.results as any[]).find((r: any) => r.day === d)
      last7Days.push({ date: d, downloads: dlRow?.count || 0, users: uRow?.count || 0 })
    }

    const totalDownloadCount = (totalDownloads as any)?.c || 0
    const downloadsLast7 = last7Days.reduce((s, d) => s + d.downloads, 0)

    const byProviderResults = (byProvider.results as any[]) || []
    const guestCountVal = (guestCount as any)?.c || 0
    const emailCountVal = (emailCount as any)?.c || 0
    const googleCountVal = (googleCount as any)?.c || 0

    const sourceResults = (sources.results as any[]) || []
    const downloadsBySource: Record<string, number> = {}
    for (const s of sourceResults) {
      downloadsBySource[s.source || 'unknown'] = s.count
    }

    return json({
      total_users: (totalUsers as any)?.c || 0,
      total_guests: guestCountVal,
      total_email_users: emailCountVal,
      total_google_users: googleCountVal,
      active_this_month: (activeUsers as any)?.c || 0,
      new_this_month: last7Days.reduce((s, d) => s + d.users, 0),
      total_downloads: totalDownloadCount,
      downloads_this_month: downloadsLast7,
      guest_downloads: 0,
      user_downloads: downloadsLast7,
      downloads_by_source: downloadsBySource,
      last_7_days: last7Days,
    })
  } catch (e: any) {
    if (e.message === 'Admin access required') return error(e.message, 403)
    if (e.message === 'Not authenticated') return error(e.message, 401)
    return error(e.message || 'Failed to fetch stats', 400)
  }
}
