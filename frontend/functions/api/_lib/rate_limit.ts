const WINDOW_MS = 60_000
const MAX_REQUESTS = 20

let _schemaEnsured = false

async function ensureSchema(db: D1Database): Promise<void> {
  if (_schemaEnsured) return
  try {
    await db.prepare(
      `CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT NOT NULL,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (key, window_start)
      )`
    ).run()
    _schemaEnsured = true
  } catch {
    // Table may already exist or DB is read-only
  }
}

export async function checkRateLimit(db: D1Database, key: string, maxRequests = MAX_REQUESTS, windowMs = WINDOW_MS): Promise<{ allowed: boolean; remaining: number }> {
  await ensureSchema(db)
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
