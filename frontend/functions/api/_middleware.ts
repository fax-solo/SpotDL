import type { RouteHandler, Env } from './_lib'

const ALLOWED_METHODS = 'GET, POST, OPTIONS'
const ALLOWED_HEADERS = 'Content-Type, Authorization'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const AUTH_ERRORS = new Set([
  'Not authenticated',
  'Invalid or expired token',
  'User not found or disabled',
  'Admin access required',
])

function getAllowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : []
}

function normalizeOrigin(o: string): string {
  const s = o.trim()
  if (s.startsWith('https://') || s.startsWith('http://')) return s
  return `https://${s}`
}

function csrfCheck(request: Request, allowedOrigins?: string): void {
  if (SAFE_METHODS.has(request.method)) return
  let requestOrigin: string | null = null

  const origin = request.headers.get('Origin')
  const referer = request.headers.get('Referer')

  if (origin && origin !== 'null') {
    try {
      requestOrigin = new URL(origin).origin
    } catch {
      throw new Error('CSRF: Invalid origin header')
    }
  } else if (referer) {
    try {
      requestOrigin = new URL(referer).origin
    } catch {
      throw new Error('CSRF: Invalid referer header')
    }
  } else {
    throw new Error('CSRF: Missing origin or referer header')
  }

  if (!requestOrigin) throw new Error('CSRF: Invalid origin header')

  const allowed: string[] = allowedOrigins
    ? allowedOrigins.split(',').map(s => s.trim()).filter(Boolean)
    : []

  if (allowed.length === 0) {
    const url = new URL(request.url)
    allowed.push(url.origin)
  }

  const normalizedAllowed = allowed.map(normalizeOrigin)
  if (!normalizedAllowed.some(o => requestOrigin === o)) {
    throw new Error('CSRF: Invalid origin')
  }
}

function errorJson(msg: string, status: number): Response {
  return new Response(JSON.stringify({ detail: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isJsonResponse(res: Response): boolean {
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json')
}

function corsOriginValue(env: Env, origin: string): string {
  const allowed = getAllowedOrigins(env)
  if (allowed.length > 0) {
    if (origin && allowed.some(a => origin === normalizeOrigin(a))) return origin
    return ''
  }
  return origin || ''
}

function corsHeaders(env: Env, origin: string): Record<string, string> {
  const co = corsOriginValue(env, origin)
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Vary': 'Origin',
  }
  if (co) headers['Access-Control-Allow-Origin'] = co
  return headers
}

export const onRequest: RouteHandler = async (context) => {
  const origin = context.request.headers.get('Origin') || ''

  // Handle preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(context.env, origin),
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // CSRF check for state-changing methods
  try {
    csrfCheck(context.request, context.env.ALLOWED_ORIGINS)
  } catch (e: any) {
    return errorJson(e.message, 403)
  }

  let response: Response
  try {
    response = await context.next()
  } catch (e: any) {
    const msg = e.message || 'Internal error'
    if (AUTH_ERRORS.has(e.message)) {
      return errorJson(msg, e.message === 'Admin access required' ? 403 : 401)
    }
    if (e.message?.startsWith('CSRF:')) {
      return errorJson(msg, 403)
    }
    return errorJson(msg, 400)
  }

  // If the response is not JSON and not a binary/stream type, and the
  // response came from an unhandled route (no Content-Type), return 404.
  if (!isJsonResponse(response)) {
    const ct = response.headers.get('content-type') || ''
    const isBinary = ct.startsWith('image/') || ct.startsWith('audio/') || ct === 'application/octet-stream'
    if (!isBinary && !ct) {
      return errorJson('Not found', 404)
    }
  }

  // Add CORS headers to all responses
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(corsHeaders(context.env, origin))) {
    headers.set(k, v)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
