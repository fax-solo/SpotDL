import { json, error, createToken, formatUser, uuid } from '../_lib'
import { validate, guestSchema } from '../_lib/validation'
import type { RouteHandler } from '../_lib'

const USER_COLS = 'id, username, email, display_name, avatar_path, role, auth_provider, is_guest, is_active, created_at, last_active, google_id, device_id'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method !== 'POST') return error('Method not allowed', 405)

  try {
    const { device_id } = validate(guestSchema, await context.request.json())

    const db = context.env.DB
    let user = await db.prepare(
      `SELECT ${USER_COLS} FROM users WHERE is_guest = 1 AND device_id = ?`
    ).bind(device_id).first()

    if (user) {
      if (!user.is_active) return error('Account disabled', 403)
      const now = new Date().toISOString()
      await db.prepare('UPDATE users SET last_active = ? WHERE id = ?').bind(now, user.id).run()
      user = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(user.id).first()
    } else {
      const existing = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE device_id = ?`).bind(device_id).first()
      if (existing) {
        user = existing
        const now = new Date().toISOString()
        await db.prepare('UPDATE users SET last_active = ?, is_guest = 1 WHERE id = ?').bind(now, existing.id).run()
        user = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(existing.id).first()
      } else {
        const id = uuid()
        const now = new Date().toISOString()
        await db.prepare(
          `INSERT INTO users (id, display_name, is_guest, device_id, created_at, last_active)
           VALUES (?, ?, 1, ?, ?, ?)`
        ).bind(id, `Guest_${device_id.slice(0, 8)}`, device_id, now, now).run()
        user = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(id).first()
      }
    }

    const token = await createToken(user.id, context.env.JWT_SECRET)
    const resp = formatUser(user, token) as any
    resp.user.is_guest = true
    return json(resp)
  } catch (e: any) {
    return error(e.message || 'Guest login failed', 400)
  }
}
