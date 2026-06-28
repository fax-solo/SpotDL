import { json, error, handleOptions, requireUser, uuid } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') return handleOptions()

  const db = context.env.DB

  try {
    const user = await requireUser(context, db)

    // GET /api/auth/history - list history
    if (context.request.method === 'GET') {
      const url = new URL(context.request.url)
      const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500)
      const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)

      const entries = await db.prepare(
        'SELECT * FROM history WHERE user_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?'
      ).bind(user.id, limit, offset).all()

      const total = await db.prepare(
        'SELECT COUNT(*) as count FROM history WHERE user_id = ?'
      ).bind(user.id).first()

      return json({
        entries: entries.results,
        total: (total as any)?.count || 0,
      })
    }

    // POST /api/auth/history - add history entry
    if (context.request.method === 'POST') {
      const body = await context.request.json() as any
      const id = uuid()
      const ts = Date.now()

      await db.prepare(
        `INSERT INTO history (id, user_id, title, artist, album, artwork_url, duration_ms, timestamp, isrc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, user.id,
        body.title || 'Unknown',
        body.artist || 'Unknown',
        body.album || 'Unknown Album',
        body.artwork_url || null,
        body.duration_ms || null,
        ts,
        body.isrc || null
      ).run()

      return json({
        id,
        title: body.title,
        artist: body.artist,
        album: body.album,
        artwork_url: body.artwork_url,
        duration_ms: body.duration_ms,
        timestamp: ts,
        isrc: body.isrc,
      }, 201)
    }

    // DELETE /api/auth/history - clear all history
    if (context.request.method === 'DELETE') {
      await db.prepare('DELETE FROM history WHERE user_id = ?').bind(user.id).run()
      return json({ ok: true })
    }

    return error('Method not allowed', 405)
  } catch (e: any) {
    return error(e.message || 'History operation failed', 400)
  }
}
