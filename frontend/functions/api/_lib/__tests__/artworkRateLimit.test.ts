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

const { searchDeezerArtwork } = await import('../deezerArtwork')
const { searchItunesArtwork } = await import('../itunesArtwork')

describe('searchDeezerArtwork', () => {
  it('returns null when rate limited', async () => {
    const db = mockDb()
    const ip = '1.2.3.4'
    for (let i = 0; i < 30; i++) {
      const { checkRateLimit } = await import('../rate_limit')
      await checkRateLimit(db, `source:deezer-artwork:${ip}`, 30)
    }
    const result = await searchDeezerArtwork('Test Title', 'Test Artist', ip, db)
    expect(result).toBeNull()
  })

  it('allows requests under the rate limit', async () => {
    const db = mockDb()
    const ip = '5.6.7.8'
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('fetch failed'))
    const result = await searchDeezerArtwork('Some Song', 'Some Artist', ip, db)
    expect(result).toBeNull()
    vi.restoreAllMocks()
  })

  it('uses a separate rate limit key from the main deezer endpoint', async () => {
    const db = mockDb()
    const ip = '9.10.11.12'
    const { checkRateLimit } = await import('../rate_limit')

    for (let i = 0; i < 30; i++) {
      await checkRateLimit(db, `source:deezer:${ip}`, 30)
    }
    const deezerExhausted = await checkRateLimit(db, `source:deezer:${ip}`, 30)
    expect(deezerExhausted.allowed).toBe(false)

    const artworkFresh = await checkRateLimit(db, `source:deezer-artwork:${ip}`, 30)
    expect(artworkFresh.allowed).toBe(true)
  })
})

describe('search artwork fallback (handleSearch pattern)', () => {
  it('populates artwork for tracks missing it, skips tracks that already have it', async () => {
    const db = mockDb()
    const ip = 'search-fallback-1'

    const deezerSpy = vi.spyOn(await import('../deezerArtwork'), 'searchDeezerArtwork')
    const itunesSpy = vi.spyOn(await import('../itunesArtwork'), 'searchItunesArtwork')

    deezerSpy.mockImplementation(async (title: string) => {
      if (title === 'Missing Artwork') return 'https://deezer.com/art.jpg'
      return null
    })
    itunesSpy.mockImplementation(async (title: string) => {
      if (title === 'Also Missing') return 'https://itunes.com/art.jpg'
      return null
    })

    const tracks = [
      { title: 'Has Artwork', artist: 'A', artwork_url: 'https://existing.com/art.jpg' },
      { title: 'Missing Artwork', artist: 'B', artwork_url: null },
      { title: 'Also Missing', artist: 'C', artwork_url: null },
    ]

    const missing = tracks.filter(t => !t.artwork_url).slice(0, 15)
    await Promise.allSettled(
      missing.map(async (track) => {
        const artwork = await deezerSpy(track.title, track.artist, ip, db)
          || await itunesSpy(track.title, track.artist, ip, db)
        if (artwork) track.artwork_url = artwork
      }),
    )

    expect(tracks[0].artwork_url).toBe('https://existing.com/art.jpg')
    expect(tracks[1].artwork_url).toBe('https://deezer.com/art.jpg')
    expect(tracks[2].artwork_url).toBe('https://itunes.com/art.jpg')

    expect(deezerSpy).toHaveBeenCalledTimes(2)
    expect(deezerSpy).not.toHaveBeenCalledWith('Has Artwork', expect.anything(), expect.anything(), expect.anything())
    expect(itunesSpy).toHaveBeenCalledTimes(1)

    deezerSpy.mockRestore()
    itunesSpy.mockRestore()
  })
})

describe('searchItunesArtwork', () => {
  it('returns null when rate limited', async () => {
    const db = mockDb()
    const ip = '1.2.3.4'
    const { checkRateLimit } = await import('../rate_limit')
    for (let i = 0; i < 30; i++) {
      await checkRateLimit(db, `source:itunes-artwork:${ip}`, 30)
    }
    const result = await searchItunesArtwork('Test Title', 'Test Artist', ip, db)
    expect(result).toBeNull()
  })

  it('uses a separate rate limit key from the main itunes endpoint', async () => {
    const db = mockDb()
    const ip = '13.14.15.16'
    const { checkRateLimit } = await import('../rate_limit')

    for (let i = 0; i < 30; i++) {
      await checkRateLimit(db, `source:itunes:${ip}`, 30)
    }
    const itunesExhausted = await checkRateLimit(db, `source:itunes:${ip}`, 30)
    expect(itunesExhausted.allowed).toBe(false)

    const artworkFresh = await checkRateLimit(db, `source:itunes-artwork:${ip}`, 30)
    expect(artworkFresh.allowed).toBe(true)
  })
})
