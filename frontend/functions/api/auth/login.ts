import { json, error, hashPassword, verifyPassword, createToken, formatUser, uuid } from '../_lib'
import { validate, loginSchema } from '../_lib/validation'
import { checkRateLimit } from '../_lib/rate_limit'
import type { RouteHandler } from '../_lib'

const USER_COLS = 'id, username, email, display_name, avatar_path, role, auth_provider, is_guest, is_active, created_at, last_active, password_hash, google_id, device_id'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method !== 'POST') return error('Method not allowed', 405)

  try {
    const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown'
    const rl = await checkRateLimit(context.env.DB, `login:${ip}`, 10)
    if (!rl.allowed) return error('Too many login attempts. Try again later.', 429)

    const { login, password } = validate(loginSchema, await context.request.json())

    const db = context.env.DB

    let user = await db.prepare(
      `SELECT ${USER_COLS} FROM users WHERE email = ? OR username = ?`
    ).bind(login, login).first()

    if (!user) {
      const adminUsername = context.env.ADMIN_USERNAME
      const adminPassword = context.env.ADMIN_PASSWORD
      if (adminUsername && adminPassword && login === adminUsername && password === adminPassword) {
        const id = uuid()
        const now = new Date().toISOString()
        const passwordHash = await hashPassword(password)
        await db.prepare(
          `INSERT INTO users (id, username, display_name, role, auth_provider, password_hash, created_at, last_active)
           VALUES (?, ?, 'Admin', 'admin', 'email', ?, ?, ?)`
        ).bind(id, adminUsername, passwordHash, now, now).run()
        user = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(id).first()
      } else {
        return error('Invalid username/email or password', 401)
      }
    } else {
      if (!user.password_hash || !await verifyPassword(password, user.password_hash, context.env.JWT_SECRET)) {
        return error('Invalid username/email or password', 401)
      }

      if (!user.is_active) return error('Account disabled', 403)

      if (user.password_hash && !user.password_hash.startsWith('$2a$') && !user.password_hash.startsWith('$2b$')) {
        const newHash = await hashPassword(password)
        await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, user.id).run()
      }

      const now = new Date().toISOString()
      await db.prepare('UPDATE users SET last_active = ? WHERE id = ?').bind(now, user.id).run()
    }

    const token = await createToken(user.id, context.env.JWT_SECRET)
    return json(formatUser(user, token))
  } catch (e: any) {
    return error(e.message || 'Login failed', 400)
  }
}
