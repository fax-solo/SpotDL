import type { PagesFunction } from '@cloudflare/workers-types'
import { csrfCheck } from './_lib/csrf'
import type { Env } from './_lib'

const AUTH_ERRORS = new Set([
  'Not authenticated',
  'Invalid or expired token',
  'User not found or disabled',
  'Admin access required',
])

function errorJson(msg: string, status: number): Response {
  return new Response(JSON.stringify({ detail: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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

  // Add CORS headers to all responses
  const corsOrigin = origin || '*'
  response.headers.set('Access-Control-Allow-Origin', corsOrigin)
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', '*')
  response.headers.set('Vary', 'Origin')

  return response
}
