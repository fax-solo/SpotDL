import { json, error, validate, verifyPassword, createToken, formatUser } from '../_lib'
import { loginSchema } from '../_lib/validation'
import { checkRateLimit } from '../_lib/rate_limit'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (context.request.method !== 'POST') {
    return error('Method not allowed', 405)
  }

  const { allowed } = await checkRateLimit(context.env.DB, `login:${context.request.headers.get('CF-Connecting-IP') || 'unknown'}`, 20)
  if (!allowed) {
    return error('Too many requests. Try again later.', 429)
  }

  let body: unknown
  try {
    body = await context.request.json()
  } catch {
    return error('Invalid JSON body', 400)
  }

  let data: ReturnType<typeof loginSchema.parse>
  try {
    data = validate(loginSchema, body)
  } catch (e: any) {
    return error(e.message, 400)
  }

  const user = await context.env.DB.prepare(
    `SELECT id, username, email, display_name, avatar_path, role, auth_provider,
            is_guest, password_hash, created_at, last_active, is_active
     FROM users WHERE email = ? OR username = ?`
  ).bind(data.login, data.login).first() as any

  if (!user) {
    return error('Invalid username/email or password', 401)
  }

  if (!user.is_active) {
    return error('Account disabled', 403)
  }

  if (!user.password_hash) {
    return error('Invalid username/email or password', 401)
  }

  const valid = await verifyPassword(data.password, user.password_hash, context.env.JWT_SECRET)
  if (!valid) {
    return error('Invalid username/email or password', 401)
  }

  if (user.password_hash && !user.password_hash.startsWith('$2a$') && !user.password_hash.startsWith('$2b$')) {
    const { hashPassword } = await import('../_lib')
    const newHash = await hashPassword(data.password)
    await context.env.DB.prepare(
      'UPDATE users SET password_hash = ? WHERE id = ?'
    ).bind(newHash, user.id).run()
  }

  await context.env.DB.prepare(
    "UPDATE users SET last_active = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
  ).bind(user.id).run()

  const token = await createToken(user.id, context.env.JWT_SECRET)
  return json(formatUser(user, token))
}
