import { json, error, formatUser, handleOptions, requireUser } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') return handleOptions()
  if (context.request.method !== 'GET') return error('Method not allowed', 405)

  try {
    const user = await requireUser(context, context.env.DB)
    return json(formatUser(user))
  } catch (e: any) {
    return error(e.message || 'Not authenticated', 401)
  }
}
