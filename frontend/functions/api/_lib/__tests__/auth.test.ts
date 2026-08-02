import { describe, it, expect, vi } from 'vitest'

const mockHmacSha256 = vi.fn()
const mockSha256 = vi.fn()
const mockB64url = vi.fn()
const mockTimingSafeEqual = vi.fn()

function b64urlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=')
  return atob(padded)
}

vi.mock('../crypto', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    sha256: mockSha256,
    hmacSha256: mockHmacSha256,
    b64url: mockB64url,
    b64urlDecode,
    timingSafeEqual: mockTimingSafeEqual,
    uuid: () => 'test-jti-123',
  }
})

vi.mock('bcryptjs', () => ({
  default: {
    genSalt: vi.fn().mockResolvedValue('salt'),
    hash: vi.fn().mockResolvedValue('$2b$10$hashed'),
    compare: vi.fn().mockResolvedValue(true),
  },
}))

const { createToken, verifyToken, hashPassword, verifyPassword, formatUser } = await import('../auth')

function mockDb(blacklistedJtis: string[] = []): D1Database {
  return {
    prepare: (sql: string) => ({
      bind: (...args: any[]) => ({
        first: async () => {
          if (sql.includes('token_blacklist') && blacklistedJtis.includes(args[0] as string)) {
            return { 1: 1 }
          }
          return null
        },
        run: async () => ({ success: true }),
      }),
    }),
  } as unknown as D1Database
}

function fakeJwt(userId: string, exp: number, jti: string, sig: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  const payload = btoa(JSON.stringify({ sub: userId, iss: 'sinc-api', exp, jti })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${header}.${payload}.${sig}`
}

describe('createToken', () => {
  it('returns a JWT-format token with 3 dot-separated parts', async () => {
    mockB64url.mockImplementation((s: string) =>
      btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'),
    )
    mockHmacSha256.mockResolvedValue('hexsig123')
    const token = await createToken('user-1', 'secret')
    const parts = token.split('.')
    expect(parts).toHaveLength(3)
    const decoded = JSON.parse(b64urlDecode(parts[1]))
    expect(decoded.sub).toBe('user-1')
    expect(decoded.iss).toBe('sinc-api')
    expect(decoded.jti).toBe('test-jti-123')
    expect(parts[2]).toBe('hexsig123')
  })
})

describe('verifyToken', () => {
  beforeEach(() => {
    mockHmacSha256.mockReset()
    mockSha256.mockReset()
    mockB64url.mockReset()
    mockTimingSafeEqual.mockReset()
    mockTimingSafeEqual.mockResolvedValue(true)
  })

  it('accepts a valid JWT token', async () => {
    mockHmacSha256.mockResolvedValue('correctsig')
    const token = fakeJwt('user-1', 9999999999, 'test-jti', 'correctsig')

    const userId = await verifyToken(token, 'secret', mockDb())
    expect(userId).toBe('user-1')
  })

  it('rejects a JWT with wrong signature', async () => {
    mockHmacSha256.mockImplementation((_input: string, secret: string) =>
      secret === 'real-secret' ? Promise.resolve('expectedsig') : Promise.resolve('wrongsig'),
    )
    mockTimingSafeEqual.mockImplementation((a: string, b: string) => Promise.resolve(a === b))
    const token = fakeJwt('user-1', 9999999999, 'test-jti', 'expectedsig')

    const userId = await verifyToken(token, 'wrong-secret', mockDb())
    expect(userId).toBeNull()
  })

  it('rejects an expired JWT token', async () => {
    mockHmacSha256.mockResolvedValue('sig')
    const token = fakeJwt('user-1', 1, 'test-jti', 'sig')

    const userId = await verifyToken(token, 'secret', mockDb())
    expect(userId).toBeNull()
  })

  it('rejects a malformed token', async () => {
    const userId = await verifyToken('invalid', 'secret', mockDb())
    expect(userId).toBeNull()
  })

  it('rejects blacklisted jti when db is provided', async () => {
    mockHmacSha256.mockResolvedValue('sig')
    const token = fakeJwt('user-1', 9999999999, 'test-jti-123', 'sig')

    const userId = await verifyToken(token, 'secret', mockDb(['test-jti-123']))
    expect(userId).toBeNull()
  })

  it('accepts blacklisted jti when db is not provided', async () => {
    mockHmacSha256.mockResolvedValue('sig')
    const token = fakeJwt('user-1', 9999999999, 'test-jti-123', 'sig')

    const userId = await verifyToken(token, 'secret')
    expect(userId).toBe('user-1')
  })

  it('accepts a valid 3-part legacy token (backward compat)', async () => {
    mockSha256.mockResolvedValue('backwardsig')
    const token = 'user-1:9999999999:backwardsig'

    const userId = await verifyToken(token, 'secret', mockDb())
    expect(userId).toBe('user-1')
  })

  it('accepts a valid 4-part legacy token (backward compat)', async () => {
    mockSha256.mockResolvedValue('backwardsig')
    const token = 'user-1:9999999999:test-jti:backwardsig'

    const userId = await verifyToken(token, 'secret', mockDb())
    expect(userId).toBe('user-1')
  })

  it('rejects a 4-part legacy token with blacklisted jti', async () => {
    mockSha256.mockResolvedValue('backwardsig')
    const token = 'user-1:9999999999:blacklisted-jti:backwardsig'

    const userId = await verifyToken(token, 'secret', mockDb(['blacklisted-jti']))
    expect(userId).toBeNull()
  })
})

describe('hashPassword / verifyPassword', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('mypassword')
    expect(hash).toBe('$2b$10$hashed')

    const valid = await verifyPassword('mypassword', '$2b$10$stored', 'secret')
    expect(valid).toBe(true)
  })

  it('verifies legacy sha256 password', async () => {
    mockSha256.mockResolvedValue('legacyhash')
    const valid = await verifyPassword('mypassword', 'legacyhash', 'secret')
    expect(valid).toBe(true)
    expect(mockSha256).toHaveBeenCalledWith('mypasswordsecret')
  })
})

describe('formatUser', () => {
  it('formats user without token', () => {
    const user = { id: '1', username: 'test', email: 'a@b.com', display_name: 'Test', avatar_path: null, role: 'user', auth_provider: 'email', is_guest: 0, created_at: '2024-01-01', last_active: '2024-01-01' }
    const result = formatUser(user)
    expect(result.id).toBe('1')
    expect(result.token).toBeUndefined()
    expect(result.is_guest).toBe(false)
  })

  it('formats user with token, returning null for r2-based avatar_path', () => {
    const user = { id: '1', username: 'test', email: 'a@b.com', display_name: 'Test', avatar_path: 'avatar.jpg', role: 'user', auth_provider: 'email', is_guest: 0, created_at: '2024-01-01', last_active: '2024-01-01' }
    const result = formatUser(user, 'mytoken')
    expect(result.token).toBe('mytoken')
    expect((result as any).user.avatar_url).toBeNull()
  })
})
