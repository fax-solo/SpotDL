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

function isAuthPath(url: string): boolean {
  try { return new URL(url).pathname.startsWith('/api/auth/') } catch { return false }
}

function csrfCheck(request: Request, allowedOrigins: string): void {
  if (SAFE_METHODS.has(request.method)) return
  if (isAuthPath(request.url)) return
  if (!allowedOrigins) return

  const allowed = allowedOrigins.split(',').map(s => s.trim()).filter(Boolean)

  const origin = request.headers.get('Origin')
  const referer = request.headers.get('Referer')

  // Native mobile clients — require explicit marker header
  if (!origin || origin === 'null') {
    if (request.headers.get('X-Mobile-Client') === '1') return
    if (referer) {
      try { requestOrigin = new URL(referer).origin } catch {}
    }
    if (!requestOrigin && !request.headers.get('X-Mobile-Client')) {
      throw new Error('CSRF: Missing origin and not a mobile client')
    }
  }

  let requestOrigin: string | null = null
  if (origin && origin !== 'null') {
    try { requestOrigin = new URL(origin).origin } catch { throw new Error('CSRF: Invalid origin header') }
  } else if (referer) {
    try { requestOrigin = new URL(referer).origin } catch { throw new Error('CSRF: Invalid referer header') }
  }

  if (!requestOrigin) return

  if (!allowed.some(o => requestOrigin === o || requestOrigin === `https://${o}` || requestOrigin === `http://${o}`)) {
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
  const raw = env.ALLOWED_ORIGINS
  if (!raw) return origin || ''
  const allowed = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (origin && allowed.some(a => origin === a || origin === `https://${a}` || origin === `http://${a}`)) return origin
  return ''
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

  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(context.env, origin),
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  try {
    csrfCheck(context.request, context.env.ALLOWED_ORIGINS || '')
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
    return errorJson(msg, 400)
  }

  if (!isJsonResponse(response)) {
    const ct = response.headers.get('content-type') || ''
    const isBinary = ct.startsWith('image/') || ct.startsWith('audio/') || ct === 'application/octet-stream'
    if (!isBinary && !ct) {
      return errorJson('Not found', 404)
    }
  }

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
