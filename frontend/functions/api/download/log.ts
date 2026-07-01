import { json, error, getUser, uuid } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method !== 'POST') return error('Method not allowed', 405)

  try {
    const user = await getUser(context, context.env.DB)
    const body = await context.request.json() as any

    const id = uuid()
    const now = new Date().toISOString()

    await context.env.DB.prepare(
      `INSERT INTO download_logs (id, user_id, track_title, track_artist, quality, source, timestamp, is_guest)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      user?.id || null,
      body.track_title || null,
      body.track_artist || null,
      body.quality || null,
      body.source || null,
      now,
      user?.is_guest ? 1 : 0
    ).run()

    return json({ ok: true })
  } catch {
    return json({ ok: true })
  }
}
