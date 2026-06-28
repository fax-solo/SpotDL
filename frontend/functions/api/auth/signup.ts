import { json, error, hashPassword, createToken, formatUser, handleOptions, uuid } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') return handleOptions()
  if (context.request.method !== 'POST') return error('Method not allowed', 405)

  try {
    const { email, password, display_name, username } = await context.request.json() as any

    if (!email || !password) return error('Email and password required', 400)
    if (password.length < 6) return error('Password must be at least 6 characters', 400)

    const db = context.env.DB

    const existing = await db.prepare(
      'SELECT id FROM users WHERE email = ? OR (username IS NOT NULL AND username = ?)'
    ).bind(email, username || '').first()

    if (existing) return error('Email or username already registered', 409)

    if (username) {
      const byUsername = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first()
      if (byUsername) return error('Username already taken', 409)
    }

    const id = uuid()
    const passwordHash = await hashPassword(password, context.env.JWT_SECRET)
    const displayName = display_name || username || email.split('@')[0]
    const now = new Date().toISOString()

    await db.prepare(
      `INSERT INTO users (id, email, username, password_hash, display_name, auth_provider, created_at, last_active)
       VALUES (?, ?, ?, ?, ?, 'email', ?, ?)`
    ).bind(id, email, username || null, passwordHash, displayName, now, now).run()

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
    const token = await createToken(id, context.env.JWT_SECRET)

    return json(formatUser(user, token), 201)
  } catch (e: any) {
    return error(e.message || 'Signup failed', 400)
  }
}
