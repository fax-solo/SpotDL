import { describe, it, expect } from 'vitest'

const { onRequest } = await import('./_middleware')

async function callHandler(method: string, headers: Record<string, string>, allowedOrigins?: string) {
  const url = 'https://spotify-downloader-5v5.pages.dev/api/search'
  const request = new Request(url, { method, headers: new Headers(headers) })
  const ctx: any = {
    request,
    env: { ALLOWED_ORIGINS: allowedOrigins },
    params: {},
    data: {},
    next: async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  }
  return onRequest(ctx)
}

describe('CSRF check', () => {
  it('rejects POST with no origin and no auth header', async () => {
    const res = await callHandler('POST', {}, 'https://example.com')
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.detail).toMatch(/CSRF/)
  })

  it('allows POST with no origin but valid Bearer token', async () => {
    const res = await callHandler('POST', { Authorization: 'Bearer some.jwt.token' }, 'https://example.com')
    expect(res.status).toBe(200)
  })

  it('allows POST with valid origin', async () => {
    const res = await callHandler('POST', { Origin: 'https://example.com' }, 'https://example.com')
    expect(res.status).toBe(200)
  })

  it('rejects POST with mismatched origin', async () => {
    const res = await callHandler('POST', { Origin: 'https://evil.com' }, 'https://example.com')
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.detail).toMatch(/CSRF/)
  })

  it('allows POST with Referer fallback when no Origin', async () => {
    const res = await callHandler('POST', { Referer: 'https://example.com/some/page' }, 'https://example.com')
    expect(res.status).toBe(200)
  })

  it('allows safe methods (GET) without CSRF check', async () => {
    const res = await callHandler('GET', {}, 'https://example.com')
    expect(res.status).toBe(200)
  })

  it('allows OPTIONS without CSRF check', async () => {
    const res = await callHandler('OPTIONS', {}, 'https://example.com')
    expect(res.status).toBe(204)
  })

  it('allows POST to auth paths without CSRF check', async () => {
    const authUrl = 'https://spotify-downloader-5v5.pages.dev/api/auth/login'
    const request = new Request(authUrl, { method: 'POST', headers: new Headers({}) })
    const ctx: any = {
      request,
      env: { ALLOWED_ORIGINS: 'https://example.com' },
      params: {},
      data: {},
      next: async () => new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    }
    const res = await onRequest(ctx)
    expect(res.status).toBe(200)
  })

  it('allows POST when no allowed origins configured', async () => {
    const res = await callHandler('POST', { Origin: 'https://example.com' }, '')
    expect(res.status).toBe(200)
  })

  it('does not crash with Referer when no Origin (regression test)', async () => {
    const res = await callHandler('POST', { Referer: 'https://example.com/page' }, 'https://example.com')
    expect(res.status).toBe(200)
  })

  it('rejects POST with null origin and no auth', async () => {
    const res = await callHandler('POST', { Origin: 'null' }, 'https://example.com')
    expect(res.status).toBe(403)
  })
})

describe('Response handling', () => {
  it('adds security headers to responses', async () => {
    const res = await callHandler('GET', {}, 'https://example.com')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains; preload')
  })

  it('adds CORS headers for allowed origin', async () => {
    const res = await callHandler('GET', { Origin: 'https://example.com' }, 'https://example.com')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS')
  })
})
