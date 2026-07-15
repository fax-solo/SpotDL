import { json, error, requireUser } from '../_lib'
import type { RouteHandler } from '../_lib'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_SIZE = 5 * 1024 * 1024

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (context.request.method !== 'POST') {
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

  let formData: FormData
  try {
    formData = await context.request.formData()
  } catch {
    return error('Invalid form data', 400)
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return error('file field is required', 400)
  }

  const blob = file as Blob
  if (!ALLOWED_TYPES.has(blob.type)) {
    return error('File must be JPEG, PNG, or WebP', 400)
  }
  if (blob.size > MAX_SIZE) {
    return error('File size exceeds 5MB limit', 400)
  }

  const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/png' ? 'png' : 'webp'
  const filename = `${user.id}-${crypto.randomUUID()}.${ext}`

  const arrayBuffer = await blob.arrayBuffer()

  const r2 = context.env.AVATARS
  if (!r2) {
    return error('Avatar storage not configured', 500)
  }

  await r2.put(filename, arrayBuffer, {
    httpMetadata: { contentType: blob.type },
  })

  if (user.avatar_path) {
    await r2.delete(user.avatar_path).catch(() => {})
  }

  await context.env.DB.prepare(
    'UPDATE users SET avatar_path = ? WHERE id = ?'
  ).bind(filename, user.id).run()

  return json({ avatar_url: `/api/avatars/${filename}` })
}
