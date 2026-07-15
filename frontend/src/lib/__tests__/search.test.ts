import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invalidateCache } from '../requestCache'

const fetchCalls: { url: string; body: any }[] = []

vi.mock('../apiConfig', () => ({
  apiUrl: (path: string) => path,
}))

beforeEach(() => {
  fetchCalls.length = 0
  invalidateCache()
  vi.stubGlobal('fetch', vi.fn((url: string, opts: any) => {
    const body = opts?.body ? JSON.parse(opts.body) : null
    fetchCalls.push({ url, body })
    if (body?.action === 'search' && url === '/api/spotify') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          tracks: [{ id: '1', title: 'Test Track', artist: 'Test Artist', album: 'Test Album', artwork_url: null, url: 'https://spotify.com/track/1', duration_ms: 200000 }],
          albums: [], artists: [], playlists: [], shows: [], top_artist: null,
        }),
      })
    }
    if (body?.action === 'search' && url === '/api/youtube') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: [{ videoId: 'abc', title: 'Test YT', author: 'Author', url: 'https://youtube.com/watch?v=abc', thumbnail: null }] }),
      })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  }))
})

import { searchSpotify, searchYouTubeTracks } from '../spotifyApi'

describe('searchSpotify caching', () => {
  it('makes only one network call for two identical queries within TTL', async () => {
    const r1 = await searchSpotify('test query', 'track', 5)
    expect(fetchCalls.length).toBe(1)

    const r2 = await searchSpotify('test query', 'track', 5)
    expect(fetchCalls.length).toBe(1)

    expect(r1).toEqual(r2)
  })

  it('makes a new network call for a different query', async () => {
    await searchSpotify('query one', 'track', 5)
    expect(fetchCalls.length).toBe(1)

    await searchSpotify('query two', 'track', 5)
    expect(fetchCalls.length).toBe(2)
  })

  it('makes a new network call for same query with different types', async () => {
    await searchSpotify('test', 'track', 5)
    expect(fetchCalls.length).toBe(1)

    await searchSpotify('test', 'track,artist', 5)
    expect(fetchCalls.length).toBe(2)
  })
})

describe('searchYouTubeTracks caching', () => {
  it('makes only one network call for two identical queries within TTL', async () => {
    await searchYouTubeTracks('test song')
    expect(fetchCalls.length).toBe(1)

    await searchYouTubeTracks('test song')
    expect(fetchCalls.length).toBe(1)
  })

  it('makes a new network call for a different query', async () => {
    await searchYouTubeTracks('song one')
    expect(fetchCalls.length).toBe(1)

    await searchYouTubeTracks('song two')
    expect(fetchCalls.length).toBe(2)
  })
})
