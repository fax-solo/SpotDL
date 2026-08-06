const WINDOW_MS = 60_000
const MAX_LOGIN_REQUESTS = 20
const MAX_REGISTER_REQUESTS = 10

const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
)`

// Deduplicate concurrent DDL: all requests in the same isolate share one
// in-flight schema creation per D1 binding, so we never race two CREATE TABLEs.
const schemaPromises = new WeakMap<D1Database, Promise<void>>()

function ensureSchema(db: D1Database): Promise<void> {
  let promise = schemaPromises.get(db)
  if (!promise) {
    promise = db
      .prepare(SCHEMA_SQL)
      .run()
      .then(() => undefined)
      .catch((err) => {
        // Allow a retry on the next request if creation failed
        schemaPromises.delete(db)
        throw err
      })
    schemaPromises.set(db, promise)
  }
  return promise
}

export async function checkRateLimit(
  db: D1Database,
  key: string,
  maxRequests: number = MAX_LOGIN_REQUESTS,
  windowMs: number = WINDOW_MS
): Promise<{ allowed: boolean; remaining: number }> {
  await ensureSchema(db)
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs

  // Best-effort cleanup of expired windows
  await db.prepare(
    'DELETE FROM rate_limits WHERE window_start < ?'
  ).bind(windowStart - windowMs).run()

  // Atomically increment and read the counter for this window
  const row = await db.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1
     RETURNING count`
  ).bind(key, windowStart).first() as { count: number } | null

  const count = row?.count ?? 1
  return {
    allowed: count <= maxRequests,
    remaining: Math.max(0, maxRequests - count),
  }
}

export function createRateLimitMiddleware(maxRequests: number, keyPrefix: string) {
  return async (c: any, next: any) => {
    const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown"
    const key = `${keyPrefix}:${ip}`
    const db = c.env.DB as D1Database

    const { allowed, remaining } = await checkRateLimit(db, key, maxRequests)

    c.header("X-RateLimit-Limit", String(maxRequests))
    c.header("X-RateLimit-Remaining", String(remaining))

    if (!allowed) {
      return c.json({ error: "Too many requests. Try again later." }, 429)
    }

    await next()
  }
}
