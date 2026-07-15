import { json, error, requireUser } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  let user: any
  try {
    user = await requireUser(context, context.env.DB)
  } catch (e: any) {
    const msg = e.message || 'Not authenticated'
    return error(msg, msg === 'Not authenticated' ? 401 : 403)
  }

  const db = context.env.DB

  if (context.request.method === 'GET') {
    const row: any = await db.prepare(
      "SELECT value FROM settings WHERE key = 'youtube_cookies'"
    ).first()
    return json({ cookies: row?.value || '' })
  }

  if (context.request.method === 'POST') {
    let body: any
    try {
      body = await context.request.json()
    } catch {
      return error('Invalid JSON', 400)
    }

    const cookies = body.cookies
    if (typeof cookies !== 'string') {
      return error('cookies must be a string', 400)
    }

    await db.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('youtube_cookies', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    ).bind(cookies).run()

    return json({ ok: true })
  }

  return error('Method not allowed', 405)
}
