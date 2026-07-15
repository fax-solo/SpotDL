import { json, error, validate, createToken, formatUser, uuid, b64urlDecode } from '../_lib'
import { googleAuthSchema } from '../_lib/validation'
import { checkRateLimit } from '../_lib/rate_limit'
import type { RouteHandler } from '../_lib'

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_ISS = 'https://accounts.google.com'
let jwksCache: { keys: JsonWebKey[]; expires: number } | null = null

async function getJwks(): Promise<JsonWebKey[]> {
  if (jwksCache && Date.now() < jwksCache.expires) return jwksCache.keys
  const res = await fetch(JWKS_URL)
  if (!res.ok) throw new Error('Failed to fetch Google JWKS')
  const { keys } = await res.json() as { keys: JsonWebKey[] }
  jwksCache = { keys, expires: Date.now() + 3600000 }
  return keys
}

async function verifyIdToken(idToken: string, clientId: string): Promise<any> {
  const parts = idToken.split('.')
  if (parts.length !== 3) throw new Error('Malformed id_token')

  const header = JSON.parse(b64urlDecode(parts[0]))
  const payload = JSON.parse(b64urlDecode(parts[1]))
  const sig = parts[2]

  if (!header.kid) throw new Error('No kid in header')
  if (payload.aud !== clientId) throw new Error('id_token audience mismatch')
  if (payload.iss !== GOOGLE_ISS && payload.iss !== 'accounts.google.com') throw new Error('id_token issuer mismatch')
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('id_token expired')

  const keys = await getJwks()
  const jwk = keys.find(k => k.kid === header.kid)
  if (!jwk) throw new Error('No matching JWK for id_token kid')

  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  )

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  const signature = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data)
  if (!valid) throw new Error('id_token signature invalid')

  return payload
}

export const onRequest: RouteHandler = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (context.request.method !== 'POST') {
    return error('Method not allowed', 405)
  }

  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown'
  const { allowed } = await checkRateLimit(context.env.DB, `auth:google:${ip}`, 10)
  if (!allowed) {
    return error('Too many requests. Try again later.', 429)
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
      userInfo = await verifyIdToken(data.id_token, clientId)
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
      userInfo = await verifyIdToken(tokens.id_token, clientId)
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
