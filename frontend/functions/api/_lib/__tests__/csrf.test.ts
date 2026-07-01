import { describe, it, expect } from 'vitest'

const { csrfCheck } = await import('../csrf')

function makeRequest(method: string, origin?: string, host?: string): Request {
  const url = host ? `https://${host}/api/test` : 'https://app.example.com/api/test'
  const headers: Record<string, string> = {}
  if (origin) headers['Origin'] = origin
  return new Request(url, { method, headers })
}

describe('csrfCheck', () => {
  it('allows GET requests without checking origin', () => {
    expect(() => csrfCheck(makeRequest('GET', 'https://evil.com'))).not.toThrow()
  })

  it('allows HEAD requests without checking origin', () => {
    expect(() => csrfCheck(makeRequest('HEAD', 'https://evil.com'))).not.toThrow()
  })

  it('allows OPTIONS requests without checking origin', () => {
    expect(() => csrfCheck(makeRequest('OPTIONS', 'https://evil.com'))).not.toThrow()
  })

  it('skips check when no Origin header is present on POST', () => {
    expect(() => csrfCheck(makeRequest('POST'))).not.toThrow()
  })

  it('allows POST from matching origin (defaults to request host)', () => {
    expect(() => csrfCheck(makeRequest('POST', 'https://app.example.com', 'app.example.com'))).not.toThrow()
  })

  it('blocks POST from non-matching origin', () => {
    expect(() => csrfCheck(makeRequest('POST', 'https://evil.com', 'app.example.com'))).toThrow('CSRF: Invalid origin')
  })

  it('allows POST from allowed origins list', () => {
    expect(() => csrfCheck(
      makeRequest('POST', 'https://myapp.com', 'app.example.com'),
      'https://myapp.com,https://other.com'
    )).not.toThrow()
  })

  it('blocks POST from origin not in allowed list', () => {
    expect(() => csrfCheck(
      makeRequest('POST', 'https://evil.com', 'app.example.com'),
      'https://myapp.com,https://other.com'
    )).toThrow('CSRF: Invalid origin')
  })

  it('checks PUT requests', () => {
    expect(() => csrfCheck(
      makeRequest('PUT', 'https://evil.com', 'app.example.com')
    )).toThrow('CSRF: Invalid origin')
  })

  it('checks DELETE requests', () => {
    expect(() => csrfCheck(
      makeRequest('DELETE', 'https://evil.com', 'app.example.com')
    )).toThrow('CSRF: Invalid origin')
  })
})
