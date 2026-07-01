import { json, error, requireUser } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method !== 'DELETE') return error('Method not allowed', 405)

  try {
    const user = await requireUser(context, context.env.DB)
    const historyId = context.params.history_id as string

    const entry = await context.env.DB.prepare(
      'SELECT id FROM history WHERE id = ? AND user_id = ?'
    ).bind(historyId, user.id).first()

    if (!entry) return error('History entry not found', 404)

    await context.env.DB.prepare('DELETE FROM history WHERE id = ?').bind(historyId).run()

    return json({ ok: true })
  } catch (e: any) {
    return error(e.message || 'Failed to delete history entry', 400)
  }
}
