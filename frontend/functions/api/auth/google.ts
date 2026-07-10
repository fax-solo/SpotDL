import { json, error, createToken, formatUser, uuid } from '../_lib'
import { validate, googleAuthSchema } from '../_lib/validation'
import type { RouteHandler } from '../_lib'

const USER_COLS = 'id, username, email, display_name, avatar_path, role, auth_provider, is_guest, is_active, created_at, last_active, google_id, device_id'

function getGoogleClientId(env: any): string {
  return env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || ''
}

async function verifyIdToken(idToken: string): Promise<any> {
  const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`)
  if (!resp.ok) throw new Error('Invalid Google token')
  return resp.json()
}

async function exchangeCode(code: string, codeVerifier: string, redirectUri: string, clientId: string, clientSecret: string): Promise<any> {
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
  })

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '')
    throw new Error(`Google token exchange failed (${resp.status}): ${errBody.slice(0, 200)}`)
  }

  const data: any = await resp.json()
  if (!data.id_token) throw new Error('No id_token in Google token response')
  return data.id_token
}

async function handleGoogleUser(info: any, email: string, googleId: string, name: string, context: any): Promise<any> {
  const db = context.env.DB

  let user = await db.prepare(
    `SELECT ${USER_COLS} FROM users WHERE google_id = ? OR email = ?`
  ).bind(googleId, email).first()

  if (user) {
    if (!user.is_active) throw new Error('Account disabled')
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

  return user
}

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method !== 'POST') return error('Method not allowed', 405)

  try {
    const body = validate(googleAuthSchema, await context.request.json())

    let info: any
    let display_name: string | undefined

    if ('id_token' in body) {
      // Legacy implicit flow: verify the id_token directly
      info = await verifyIdToken(body.id_token)
      display_name = (body as any).display_name
    } else {
      // PKCE code flow: exchange code + verifier for tokens
      const clientId = getGoogleClientId(context.env)
      const clientSecret = context.env.GOOGLE_CLIENT_SECRET || ''
      if (!clientId) return error('Google sign-in is not configured (missing GOOGLE_CLIENT_ID)', 500)
      if (!clientSecret) return error('Google sign-in is not configured (missing GOOGLE_CLIENT_SECRET)', 500)
      const idToken = await exchangeCode(body.code, body.code_verifier, body.redirect_uri, clientId, clientSecret)
      info = await verifyIdToken(idToken)
      display_name = (body as any).display_name
    }

    const googleId = info.sub as string
    const email = info.email as string
    const name = display_name || info.name || email?.split('@')[0] || 'User'

    const user = await handleGoogleUser(info, email, googleId, name, context)

    const token = await createToken(user.id, context.env.JWT_SECRET)
    return json(formatUser(user, token))
  } catch (e: any) {
    if (e.message === 'Account disabled') return error(e.message, 403)
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
