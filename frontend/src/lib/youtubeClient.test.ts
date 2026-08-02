import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Capacitor } from '@capacitor/core'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}))

vi.mock('./apiConfig', () => ({
  apiUrl: vi.fn((path: string) => path),
}))

import { searchYouTube, getVideoInfo, proxyAudioUrl } from './youtubeClient'

const FAKE_VIDEO_ID = 'abc123def45'

describe('proxyAudioUrl', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('wraps URL via proxy on all platforms', () => {
    const result = proxyAudioUrl('https://example.com/audio')
    expect(result).toContain('/api/proxy')
    expect(result).toContain(encodeURIComponent('https://example.com/audio'))
  })
})

describe('searchYouTube', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
  })

  it('returns search results from Cloudflare Function', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        results: [
          { videoId: FAKE_VIDEO_ID, title: 'Test Song', url: `https://youtube.com/watch?v=${FAKE_VIDEO_ID}` },
        ],
      }),
    } as Response)

    const results = await searchYouTube('test query')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Test Song')
  })

  it('returns empty array when the function is unreachable (non-throwing)', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    await expect(searchYouTube('test')).resolves.toEqual([])
  })

  it('returns empty array when the function reports no results', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    } as Response)

    await expect(searchYouTube('test')).resolves.toEqual([])
  })
})

describe('getVideoInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
  })

  it('returns video info from Cloudflare Function and wraps audio URL via proxy', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        title: 'CF Video', author: 'CF Creator', duration: '180', audioUrl: 'https://audio.cf/stream', thumbnail: 'thumb.jpg',
      }),
    } as Response)

    const info = await getVideoInfo(`https://youtube.com/watch?v=${FAKE_VIDEO_ID}`)
    expect(info.title).toBe('CF Video')
    expect(info.audioUrl).toContain('/api/proxy')
    expect(info.audioUrl).toContain(encodeURIComponent('https://audio.cf/stream'))
  })

  it('throws on invalid URL', async () => {
    await expect(getVideoInfo('not-a-url')).rejects.toThrow('Invalid YouTube URL')
  })

  it('throws when the function fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))
    await expect(getVideoInfo(`https://youtube.com/watch?v=${FAKE_VIDEO_ID}`)).rejects.toThrow('Failed to get video info')
  })

  it('throws when the function returns a non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response)
    await expect(getVideoInfo(`https://youtube.com/watch?v=${FAKE_VIDEO_ID}`)).rejects.toThrow('Failed to get video info')
  })
})
