import { json, error, requireUser, formatUser } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (context.request.method !== 'GET') {
    return error('Method not allowed', 405)
  }

  let user: any
  try {
    user = await requireUser(context, context.env.DB)
  } catch (e: any) {
    if (e.message === 'Not authenticated' || e.message === 'Invalid or expired token' || e.message === 'User not found or disabled') {
      return error(e.message, 401)
    }
    throw e
  }

  await context.env.DB.prepare(
    "UPDATE users SET last_active = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
  ).bind(user.id).run()

  return json(formatUser(user))
}
