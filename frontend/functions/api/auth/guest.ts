import { json, error, validate, createToken, formatUser, uuid, sha256 } from '../_lib'
import { guestSchema } from '../_lib/validation'
import { checkRateLimit } from '../_lib/rate_limit'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (context.request.method !== 'POST') {
    return error('Method not allowed', 405)
  }

  const { allowed } = await checkRateLimit(context.env.DB, `guest:${context.request.headers.get('CF-Connecting-IP') || 'unknown'}`, 10)
  if (!allowed) {
    return error('Too many requests. Try again later.', 429)
  }

  let body: unknown
  try {
    body = await context.request.json()
  } catch {
    return error('Invalid JSON body', 400)
  }

  let data: ReturnType<typeof guestSchema.parse>
  try {
    data = validate(guestSchema, body)
  } catch (e: any) {
    return error(e.message, 400)
  }

  const deviceHash = await sha256(data.device_id + context.env.JWT_SECRET)

  let user = await context.env.DB.prepare(
    'SELECT id, username, email, display_name, avatar_path, role, auth_provider, is_guest, device_id, created_at, last_active, is_active FROM users WHERE is_guest = 1 AND device_id = ?'
  ).bind(deviceHash).first() as any

  if (user) {
    if (!user.is_active) {
      return error('Account disabled', 403)
    }
    await context.env.DB.prepare(
      "UPDATE users SET last_active = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
    ).bind(user.id).run()
  } else {
    const userId = uuid()
    const displayName = `Guest_${data.device_id.slice(0, 8)}`
    await context.env.DB.prepare(
      `INSERT INTO users (id, display_name, auth_provider, is_guest, device_id)
       VALUES (?, ?, 'guest', 1, ?)`
    ).bind(userId, displayName, deviceHash).run()

    user = await context.env.DB.prepare(
      'SELECT id, username, email, display_name, avatar_path, role, auth_provider, is_guest, device_id, created_at, last_active, is_active FROM users WHERE id = ?'
    ).bind(userId).first() as any
  }

  const token = await createToken(user.id, context.env.JWT_SECRET)
  const resp = formatUser(user, token) as any
  resp.user.is_guest = true
  return json(resp)
}
