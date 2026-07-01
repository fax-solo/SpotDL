import { describe, it, expect, vi } from 'vitest'

function mockDb(): D1Database {
  const counts = new Map<string, number>()
  const noop = { first: async () => null, run: async () => ({ success: true }) }

  const handler: any = {
    prepare: (sql: string) => ({
      bind: (...args: any[]) => {
        if (sql.includes('SELECT count')) {
          const key = `${args[0]}:${args[1]}`
          return {
            first: async () => counts.has(key) ? { count: counts.get(key) } : null,
            run: async () => ({ success: true }),
          }
        }
        if (sql.includes('INSERT INTO rate_limits')) {
          const key = `${args[0]}:${args[1]}`
          counts.set(key, (counts.get(key) || 0) + 1)
          return { first: noop.first, run: async () => ({ success: true }) }
        }
        return noop
      },
    }),
  }

  return handler as unknown as D1Database
}

const { checkRateLimit } = await import('../rate_limit')

describe('checkRateLimit', () => {
  it('allows requests under the limit', async () => {
    const db = mockDb()
    const result = await checkRateLimit(db, 'test-key', 5, 60000)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('blocks requests over the limit', async () => {
    const db = mockDb()
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(db, 'block-key', 5, 60000)
    }
    const result = await checkRateLimit(db, 'block-key', 5, 60000)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('allows requests on different keys independently', async () => {
    const db = mockDb()
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(db, 'full-key', 5, 60000)
    }
    const full = await checkRateLimit(db, 'full-key', 5, 60000)
    expect(full.allowed).toBe(false)

    const fresh = await checkRateLimit(db, 'fresh-key', 5, 60000)
    expect(fresh.allowed).toBe(true)
  })
})
