import { json, error, getUser } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (context.request.method !== 'POST') {
    return error('Method not allowed', 405)
  }

  let body: any
  try {
    body = await context.request.json()
  } catch {
    return error('Invalid JSON body', 400)
  }

  const user = await getUser(context, context.env.DB, false)
  const isGuest = user ? user.is_guest : 1

  const { track_title, track_artist, quality, source } = body
  if (!track_title || !track_artist) {
    return error('track_title and track_artist are required', 400)
  }

  await context.env.DB.prepare(
    `INSERT INTO download_logs (user_id, track_title, track_artist, quality, source, is_guest)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(user?.id || null, track_title, track_artist, quality || null, source || null, isGuest).run()

  return json({ ok: true })
}
