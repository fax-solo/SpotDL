import { json, error, requireUser } from '../_lib'
import { validate, updateProfileSchema } from '../_lib/validation'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method !== 'PUT') return error('Method not allowed', 405)

  try {
    const user = await requireUser(context, context.env.DB)
    const { display_name } = validate(updateProfileSchema, await context.request.json())

    if (display_name !== undefined) {
      await context.env.DB.prepare('UPDATE users SET display_name = ? WHERE id = ?')
        .bind(display_name, user.id).run()
    }

    return json({
      id: user.id,
      display_name: display_name ?? user.display_name,
      avatar_url: user.avatar_path ? `/api/avatars/${user.avatar_path}` : null,
    })
  } catch (e: any) {
    return error(e.message || 'Failed to update profile', 400)
  }
}
