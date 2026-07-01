const WINDOW_MS = 60_000
const MAX_REQUESTS = 20

export async function checkRateLimit(db: D1Database, key: string, maxRequests = MAX_REQUESTS, windowMs = WINDOW_MS): Promise<{ allowed: boolean; remaining: number }> {
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs

  // Clean old entries
  await db.prepare(
    'DELETE FROM rate_limits WHERE window_start < ?'
  ).bind(windowStart - windowMs).run()

  // Upsert current window
  await db.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1`
  ).bind(key, windowStart).run()

  const row = await db.prepare(
    'SELECT count FROM rate_limits WHERE key = ? AND window_start = ?'
  ).bind(key, windowStart).first() as { count: number } | null

  const count = row?.count ?? 0
  return {
    allowed: count <= maxRequests,
    remaining: Math.max(0, maxRequests - count),
  }
}
