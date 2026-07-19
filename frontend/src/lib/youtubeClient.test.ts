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

  it('returns original URL when not on native', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
    expect(proxyAudioUrl('https://example.com/audio')).toBe('https://example.com/audio')
  })

  it('wraps URL via proxy when on native', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
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
    const pipedEmpty = {
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce(pipedEmpty)
      .mockResolvedValueOnce(pipedEmpty)
      .mockResolvedValueOnce(pipedEmpty)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [
            { videoId: FAKE_VIDEO_ID, title: 'Test Song', url: `https://youtube.com/watch?v=${FAKE_VIDEO_ID}` },
          ],
        }),
      })

    const results = await searchYouTube('test query')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Test Song')
  })

  it('tries Piped API first on web', async () => {
    const pipedResult = {
      ok: true,
      json: () => Promise.resolve({
        items: [
          { url: `/watch?v=${FAKE_VIDEO_ID}`, title: 'Piped Result', thumbnail: 'thumb.jpg' },
        ],
      }),
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce(pipedResult)
      .mockResolvedValueOnce(pipedResult)
      .mockResolvedValueOnce(pipedResult)

    await searchYouTube('test')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('pipedapi'), expect.anything())
  })

  it('throws on total failure', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))

    await expect(searchYouTube('test')).rejects.toThrow()
  })
})

describe('getVideoInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
  })

  it('returns video info from Piped API', async () => {
    const pipedResult = {
      title: 'Piped Video',
      uploader: 'Piped Creator',
      duration: 250,
      audioStreams: [{ url: 'https://audio.piped/stream', bitrate: 128000 }],
      thumbnailUrl: 'thumb.jpg',
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(pipedResult),
      })
      .mockRejectedValueOnce(new Error('Piped instance 2 fail'))
      .mockRejectedValueOnce(new Error('Piped instance 3 fail'))
      .mockRejectedValueOnce(new Error('CF function fail'))

    const info = await getVideoInfo(`https://youtube.com/watch?v=${FAKE_VIDEO_ID}`)
    expect(info.title).toBe('Piped Video')
    expect(info.audioUrl).toContain('audio.piped')
  })

  it('falls back to Cloudflare Function when Piped fails', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('Piped fail 1'))
      .mockRejectedValueOnce(new Error('Piped fail 2'))
      .mockRejectedValueOnce(new Error('Piped fail 3'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          title: 'CF Video', author: 'CF Creator', duration: '180', audioUrl: 'https://audio.cf/stream', thumbnail: null,
        }),
      })

    const info = await getVideoInfo(`https://youtube.com/watch?v=${FAKE_VIDEO_ID}`)
    expect(info.title).toBe('CF Video')
  })

  it('throws on invalid URL', async () => {
    await expect(getVideoInfo('not-a-url')).rejects.toThrow('Invalid YouTube URL')
  })

  it('throws when both sources fail', async () => {
    vi.mocked(fetch)
      .mockRejectedValue(new Error('Network error'))
    await expect(getVideoInfo(`https://youtube.com/watch?v=${FAKE_VIDEO_ID}`)).rejects.toThrow('Failed to get video info')
  })
})
