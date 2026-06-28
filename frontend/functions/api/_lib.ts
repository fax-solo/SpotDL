import type { PagesFunction } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
  JWT_SECRET: string
  ADMIN_USERNAME: string
  ADMIN_PASSWORD: string
  GOOGLE_CLIENT_ID?: string
}

export type RouteHandler = PagesFunction<Env>

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  })
}

export function error(msg: string, status: number): Response {
  return json({ detail: msg }, status)
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256(input: string): Promise<string> {
  const enc = new TextEncoder()
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(input))
  return hex(hash)
}

export async function createToken(userId: string, secret: string): Promise<string> {
  const expiry = Math.floor(Date.now() / 1000) + 72 * 3600
  const payload = `${userId}:${expiry}`
  const sig = await sha256(payload + secret)
  return `${payload}:${sig}`
}

export async function verifyToken(token: string, secret: string): Promise<string | null> {
  const parts = token.split(':')
  if (parts.length !== 3) return null
  const [userId, expiryStr, sig] = parts
  const expiry = Number(expiryStr)
  if (isNaN(expiry) || expiry < Math.floor(Date.now() / 1000)) return null
  const expected = await sha256(`${userId}:${expiryStr}` + secret)
  if (sig !== expected) return null
  return userId
}

export async function hashPassword(password: string, secret: string): Promise<string> {
  return sha256(password + secret)
}

export async function getUser(context: { request: Request; env: Env; params: any }, db: D1Database, requireAuth = false): Promise<any | null> {
  const auth = context.request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    if (requireAuth) throw new Error('Not authenticated')
    return null
  }
  const userId = await verifyToken(auth.slice(7), context.env.JWT_SECRET)
  if (!userId) {
    if (requireAuth) throw new Error('Invalid or expired token')
    return null
  }
  const user = await db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').bind(userId).first()
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
    avatar_url: user.avatar_path ? `/api/avatars/${user.avatar_path}` : null,
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

export function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    },
  })
}

export function uuid(): string {
  return crypto.randomUUID()
}
