import { json, error, createToken, formatUser, uuid } from '../_lib'
import { validate, googleAuthSchema } from '../_lib/validation'
import type { RouteHandler } from '../_lib'

const USER_COLS = 'id, username, email, display_name, avatar_path, role, auth_provider, is_guest, is_active, created_at, last_active, google_id, device_id'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method !== 'POST') return error('Method not allowed', 405)

  try {
    const { id_token, display_name } = validate(googleAuthSchema, await context.request.json())

    const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`)
    if (!resp.ok) return error('Invalid Google token', 401)

    const info: any = await resp.json()
    const googleId = info.sub as string
    const email = info.email as string
    const name = display_name || info.name || email?.split('@')[0] || 'User'

    const db = context.env.DB

    let user = await db.prepare(
      `SELECT ${USER_COLS} FROM users WHERE google_id = ? OR email = ?`
    ).bind(googleId, email).first()

    if (user) {
      if (!user.is_active) return error('Account disabled', 403)
      const now = new Date().toISOString()
      if (!user.google_id) {
        await db.prepare('UPDATE users SET google_id = ?, last_active = ? WHERE id = ?').bind(googleId, now, user.id).run()
      } else {
        await db.prepare('UPDATE users SET last_active = ? WHERE id = ?').bind(now, user.id).run()
      }
      if (!user.avatar_path && info.picture) {
        const r2 = (context.env as any).AVATARS as R2Bucket | undefined
        const avatarPath = await saveGoogleAvatar(info.picture, user.id, r2)
        if (avatarPath) {
          await db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').bind(avatarPath, user.id).run()
        }
      }
      user = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(user.id).first()
    } else {
      const id = uuid()
      const now = new Date().toISOString()
      let avatarPath: string | null = null
      if (info.picture) {
        const r2 = (context.env as any).AVATARS as R2Bucket | undefined
        avatarPath = await saveGoogleAvatar(info.picture, email, r2)
      }
      await db.prepare(
        `INSERT INTO users (id, email, display_name, google_id, auth_provider, avatar_path, created_at, last_active)
         VALUES (?, ?, ?, ?, 'google', ?, ?, ?)`
      ).bind(id, email, name, googleId, avatarPath, now, now).run()
      user = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(id).first()
    }

    const token = await createToken(user.id, context.env.JWT_SECRET)
    return json(formatUser(user, token))
  } catch (e: any) {
    return error(e.message || 'Google auth failed', 400)
  }
}

async function saveGoogleAvatar(pictureUrl: string, ident: string, r2?: R2Bucket): Promise<string | null> {
  try {
    const resp = await fetch(pictureUrl)
    if (!resp.ok) return null
    const blob = await resp.blob()
    const ext = 'jpg'
    const filename = `${ident}_${crypto.randomUUID().slice(0, 8)}.${ext}`
    const arrayBuf = await blob.arrayBuffer()

    if (r2) {
      await r2.put(filename, arrayBuf, {
        httpMetadata: { contentType: `image/${ext}` },
      })
      return filename
    }
    return null
  } catch {
    return null
  }
}
