import { json, error, requireUser } from '../_lib'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method !== 'POST') return error('Method not allowed', 405)

  try {
    const user = await requireUser(context, context.env.DB)
    const formData = await context.request.formData()
    const file = formData.get('file') as File | null

    if (!file) return error('No file provided', 400)
    if (!file.type.startsWith('image/')) return error('File must be an image', 400)
    if (file.size > 5 * 1024 * 1024) return error('File too large (max 5MB)', 400)

    const ext = file.name.split('.').pop() || 'jpg'
    const filename = `${user.id}_${crypto.randomUUID().slice(0, 8)}.${ext}`
    const arrayBuf = await file.arrayBuffer()

    // Store in R2 bucket if configured, otherwise return path
    const r2 = (context.env as any).AVATARS as R2Bucket | undefined
    if (r2) {
      await r2.put(filename, arrayBuf, {
        httpMetadata: { contentType: file.type },
      })
    }

    // Remove old avatar
    if (user.avatar_path) {
      if (r2) {
        await r2.delete(user.avatar_path).catch(() => {})
      }
    }

    await context.env.DB.prepare('UPDATE users SET avatar_path = ? WHERE id = ?')
      .bind(filename, user.id).run()

    return json({ avatar_url: `/api/avatars/${filename}` })
  } catch (e: any) {
    return error(e.message || 'Upload failed', 400)
  }
}
