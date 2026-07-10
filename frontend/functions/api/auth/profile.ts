import { json, error, validate, requireUser, formatUser } from '../_lib'
import { updateProfileSchema } from '../_lib/validation'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (context.request.method !== 'PUT') {
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

  let body: unknown
  try {
    body = await context.request.json()
  } catch {
    return error('Invalid JSON body', 400)
  }

  let data: ReturnType<typeof updateProfileSchema.parse>
  try {
    data = validate(updateProfileSchema, body)
  } catch (e: any) {
    return error(e.message, 400)
  }

  if (data.display_name !== undefined) {
    await context.env.DB.prepare(
      'UPDATE users SET display_name = ? WHERE id = ?'
    ).bind(data.display_name, user.id).run()
    user.display_name = data.display_name
  }

  return json(formatUser(user))
}
