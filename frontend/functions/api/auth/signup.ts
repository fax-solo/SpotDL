import { json, error, validate, hashPassword, createToken, formatUser, uuid } from '../_lib'
import { signupSchema } from '../_lib/validation'
import { checkRateLimit } from '../_lib/rate_limit'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (context.request.method !== 'POST') {
    return error('Method not allowed', 405)
  }

  const { allowed, remaining } = await checkRateLimit(context.env.DB, `signup:${context.request.headers.get('CF-Connecting-IP') || 'unknown'}`, 10)
  if (!allowed) {
    return error('Too many requests. Try again later.', 429)
  }

  let body: unknown
  try {
    body = await context.request.json()
  } catch {
    return error('Invalid JSON body', 400)
  }

  let data: ReturnType<typeof signupSchema.parse>
  try {
    data = validate(signupSchema, body)
  } catch (e: any) {
    return error(e.message, 400)
  }

  const existing = await context.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(data.email).first()
  if (existing) {
    return error('Email already registered', 409)
  }

  if (data.username) {
    const usernameTaken = await context.env.DB.prepare(
      'SELECT id FROM users WHERE username = ?'
    ).bind(data.username).first()
    if (usernameTaken) {
      return error('Username already taken', 409)
    }
  }

  const userId = uuid()
  const passwordHash = await hashPassword(data.password)
  const displayName = data.display_name || data.username || data.email.split('@')[0]

  await context.env.DB.prepare(
    `INSERT INTO users (id, username, email, password_hash, display_name, auth_provider, role, is_guest)
     VALUES (?, ?, ?, ?, ?, 'email', 'user', 0)`
  ).bind(userId, data.username || null, data.email, passwordHash, displayName).run()

  const user = await context.env.DB.prepare(
    'SELECT id, username, email, display_name, avatar_path, role, auth_provider, is_guest, created_at, last_active FROM users WHERE id = ?'
  ).bind(userId).first()

  const token = await createToken(userId, context.env.JWT_SECRET)
  return json(formatUser(user, token))
}
