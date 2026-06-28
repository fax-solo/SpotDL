import { json, error, hashPassword, createToken, formatUser, handleOptions, uuid } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') return handleOptions()
  if (context.request.method !== 'POST') return error('Method not allowed', 405)

  try {
    const { login, password } = await context.request.json() as any
    if (!login || !password) return error('Login and password required', 400)

    const db = context.env.DB

    let user = await db.prepare(
      'SELECT * FROM users WHERE email = ? OR username = ?'
    ).bind(login, login).first()

    if (!user) {
      // Check if this is the admin user trying to log in for the first time
      const adminUsername = context.env.ADMIN_USERNAME || 'mohamed baalash'
      const adminPassword = context.env.ADMIN_PASSWORD || '50112010***Solo'
      if (login === adminUsername && password === adminPassword) {
        const id = uuid()
        const now = new Date().toISOString()
        const passwordHash = await hashPassword(password, context.env.JWT_SECRET)
        await db.prepare(
          `INSERT INTO users (id, username, display_name, role, auth_provider, password_hash, created_at, last_active)
           VALUES (?, ?, 'Admin', 'admin', 'email', ?, ?, ?)`
        ).bind(id, adminUsername, passwordHash, now, now).run()
        user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
      } else {
        return error('Invalid username/email or password', 401)
      }
    } else {
      const passwordHash = await hashPassword(password, context.env.JWT_SECRET)
      if (user.password_hash !== passwordHash) return error('Invalid username/email or password', 401)

      if (!user.is_active) return error('Account disabled', 403)

      const now = new Date().toISOString()
      await db.prepare('UPDATE users SET last_active = ? WHERE id = ?').bind(now, user.id).run()
    }

    const token = await createToken(user.id, context.env.JWT_SECRET)
    return json(formatUser(user, token))
  } catch (e: any) {
    return error(e.message || 'Login failed', 400)
  }
}
