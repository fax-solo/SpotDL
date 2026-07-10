import { json, error, validate, createToken, formatUser, uuid } from '../_lib'
import { googleAuthSchema } from '../_lib/validation'
import type { RouteHandler } from '../_lib'

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (context.request.method !== 'POST') {
    return error('Method not allowed', 405)
  }

  const clientId = context.env.GOOGLE_CLIENT_ID
  const clientSecret = context.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return error('Google sign-in is not configured on the server', 500)
  }

  let body: unknown
  try {
    body = await context.request.json()
  } catch {
    return error('Invalid JSON body', 400)
  }

  let data: ReturnType<typeof googleAuthSchema.parse>
  try {
    data = validate(googleAuthSchema, body)
  } catch (e: any) {
    return error(e.message, 400)
  }

  let userInfo: { sub: string; email?: string; name?: string; picture?: string }

  if ('id_token' in data) {
    try {
      const payload = JSON.parse(atob(data.id_token.split('.')[1]))
      userInfo = payload
    } catch {
      return error('Invalid id_token', 400)
    }
  } else {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: data.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: data.redirect_uri,
        code_verifier: data.code_verifier,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '')
      return error(`Google token exchange failed: ${errText}`, 400)
    }

    const tokens: any = await tokenRes.json()
    if (!tokens.id_token) {
      return error('No id_token in Google response', 400)
    }

    try {
      userInfo = JSON.parse(atob(tokens.id_token.split('.')[1]))
    } catch {
      return error('Invalid id_token from Google', 400)
    }
  }

  const googleId = userInfo.sub
  const email = userInfo.email || `${googleId}@google.auth`
  const displayName = data.display_name || userInfo.name || email.split('@')[0]

  let user: any = await context.env.DB.prepare(
    'SELECT id, username, email, display_name, avatar_path, role, auth_provider, is_guest, created_at, last_active FROM users WHERE google_id = ?'
  ).bind(googleId).first()

  if (!user) {
    const existing = await context.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email).first()

    if (existing) {
      await context.env.DB.prepare(
        'UPDATE users SET google_id = ?, auth_provider = ? WHERE id = ?'
      ).bind(googleId, 'google', existing.id).run()
      user = await context.env.DB.prepare(
        'SELECT id, username, email, display_name, avatar_path, role, auth_provider, is_guest, created_at, last_active FROM users WHERE id = ?'
      ).bind(existing.id).first()
    } else {
      const userId = uuid()
      await context.env.DB.prepare(
        `INSERT INTO users (id, google_id, email, display_name, auth_provider, role, is_guest)
         VALUES (?, ?, ?, ?, 'google', 'user', 0)`
      ).bind(userId, googleId, email, displayName).run()
      user = await context.env.DB.prepare(
        'SELECT id, username, email, display_name, avatar_path, role, auth_provider, is_guest, created_at, last_active FROM users WHERE id = ?'
      ).bind(userId).first()
    }
  }

  const token = await createToken(user.id, context.env.JWT_SECRET)
  return json(formatUser(user, token))
}
