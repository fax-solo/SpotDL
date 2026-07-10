import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env } from './_lib'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const AUTH_ERRORS = new Set([
  'Not authenticated',
  'Invalid or expired token',
  'User not found or disabled',
  'Admin access required',
])

function csrfCheck(request: Request, allowedOrigins?: string): void {
  if (SAFE_METHODS.has(request.method)) return
  const origin = request.headers.get('Origin')
  if (!origin) return

  let requestOrigin: string | null = null
  try {
    requestOrigin = new URL(origin).origin
  } catch {
    throw new Error('CSRF: Invalid origin header')
  }
  if (!requestOrigin) throw new Error('CSRF: Invalid origin header')

  const allowed: string[] = allowedOrigins
    ? allowedOrigins.split(',').map(s => s.trim()).filter(Boolean)
    : []

  if (allowed.length === 0) {
    const url = new URL(request.url)
    allowed.push(url.origin)
    // In development, Vite proxy changes the request URL but the browser's
    // Origin stays the same. Accept the Origin header value too so CSRF
    // doesn't break when running locally with the Vite dev server.
    if (requestOrigin !== url.origin) {
      allowed.push(requestOrigin)
    }
  }

  if (!allowed.some(o => requestOrigin === o)) {
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

export const onRequest: PagesFunction<Env> = async (context) => {
  const origin = context.request.headers.get('Origin') || ''

  // Handle preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
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

  // If the response is not JSON (e.g., index.html from catch-all redirect),
  // this means no function handled the route. Return a proper API error.
  if (!isJsonResponse(response)) {
    return errorJson('Not found', 404)
  }

  // Add CORS headers to all responses
  const corsOrigin = origin || '*'
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', corsOrigin)
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  headers.set('Access-Control-Allow-Headers', '*')
  headers.set('Vary', 'Origin')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
