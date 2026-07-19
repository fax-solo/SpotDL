import bcrypt from 'bcryptjs'
import type { Env } from './index'
import { sha256, hmacSha256, b64url, b64urlDecode, uuid } from './crypto'

export async function createToken(userId: string, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    sub: userId,
    iss: 'sinc-api',
    iat: now,
    exp: now + 72 * 3600,
    jti: uuid(),
  }))
  const sig = await hmacSha256(`${header}.${payload}`, secret)
  return `${header}.${payload}.${sig}`
}

export async function verifyToken(token: string, secret: string, db?: D1Database): Promise<string | null> {
  const colonParts = token.split(':')
  if (colonParts.length === 3 || colonParts.length === 4) {
    return verifyLegacyToken(colonParts, secret, db)
  }

  const dotParts = token.split('.')
  if (dotParts.length !== 3) return null

  const [headerB64, payloadB64, sig] = dotParts
  let payload: any
  try {
    payload = JSON.parse(b64urlDecode(payloadB64))
  } catch {
    return null
  }

  const expected = await hmacSha256(`${headerB64}.${payloadB64}`, secret)
  if (sig !== expected) return null

  const exp = payload.exp
  if (exp && exp < Math.floor(Date.now() / 1000)) return null

  const jti: string | undefined = payload.jti
  if (jti && db) {
    const blacklisted = await db.prepare(
      'SELECT 1 FROM token_blacklist WHERE jti = ?'
    ).bind(jti).first()
    if (blacklisted) return null
  }

  return payload.sub || null
}

async function verifyLegacyToken(parts: string[], secret: string, db?: D1Database): Promise<string | null> {
  let userId: string, expiryStr: string, sig: string, jti: string | undefined

  if (parts.length === 4) {
    [userId, expiryStr, jti, sig] = parts
  } else {
    [userId, expiryStr, sig] = parts
  }

  const expiry = Number(expiryStr)
  if (isNaN(expiry) || expiry < Math.floor(Date.now() / 1000)) return null

  const sigInput = jti !== undefined ? `${userId}:${expiryStr}:${jti}` : `${userId}:${expiryStr}`
  const expected = await sha256(sigInput + secret)
  if (sig !== expected) return null

  if (jti && db) {
    const blacklisted = await db.prepare(
      'SELECT 1 FROM token_blacklist WHERE jti = ?'
    ).bind(jti).first()
    if (blacklisted) return null
  }

  return userId
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

export async function verifyPassword(password: string, storedHash: string, secret: string): Promise<boolean> {
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
    return bcrypt.compare(password, storedHash)
  }
  const expected = await sha256(password + secret)
  return storedHash === expected
}

export async function getUser(context: { request: Request; env: Env; params: any }, db: D1Database, requireAuth = false): Promise<any | null> {
  const auth = context.request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    if (requireAuth) throw new Error('Not authenticated')
    return null
  }
  let userId: string | null
  try {
    userId = await verifyToken(auth.slice(7), context.env.JWT_SECRET, db)
  } catch {
    if (requireAuth) throw new Error('Invalid or expired token')
    return null
  }
  if (!userId) {
    if (requireAuth) throw new Error('Invalid or expired token')
    return null
  }
  const user = await db.prepare('SELECT id, username, email, display_name, avatar_path, role, auth_provider, is_guest, is_active, created_at, last_active FROM users WHERE id = ? AND is_active = 1').bind(userId).first()
  if (!user) {
    if (requireAuth) throw new Error('User not found or disabled')
    return null
  }
  return user
}

export async function requireUser(context: { request: Request; env: Env; params: any }, db: D1Database): Promise<any> {
  const user = await getUser(context, db, true)
  if (!user) throw new Error('Not authenticated')
  return user
}

export async function requireAdmin(context: { request: Request; env: Env; params: any }, db: D1Database): Promise<any> {
  const user = await requireUser(context, db)
  if (user.role !== 'admin') throw new Error('Admin access required')
  return user
}

export function formatUser(user: any, token?: string): Record<string, unknown> {
  const u: Record<string, unknown> = {
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.display_name,
    avatar_url: user.avatar_path?.startsWith('data:') ? user.avatar_path : null,
    role: user.role,
    auth_provider: user.auth_provider,
    is_guest: Boolean(user.is_guest),
    created_at: user.created_at,
    last_active: user.last_active,
  }
  if (token) {
    return { token, user: u }
  }
  return u
}
