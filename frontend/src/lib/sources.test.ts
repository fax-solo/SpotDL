import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./youtubeClient', () => ({
  searchYouTube: vi.fn(),
  getVideoInfo: vi.fn(),
}))

vi.mock('./apiConfig', () => ({
  apiUrl: vi.fn((path: string) => path),
}))

vi.mock('./deezer', () => ({
  searchDeezer: vi.fn(),
  getDeezerTrack: vi.fn(),
}))

import { searchYouTube, getVideoInfo } from './youtubeClient'
import { searchDeezer } from './deezer'
import { invalidateCache } from './requestCache'

async function callFunction(name: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
  return res.json()
}

async function searchSoundcloud(query: string) {
  const data = await callFunction('soundcloud', { action: 'search', query })
  return data?.results || []
}

async function soundcloudInfo(url: string) {
  const data = await callFunction('soundcloud', { action: 'info', url })
  return data
}

async function performYouTubeSearch(query: string) {
  const results = await searchYouTube(query)
  return results.map(r => ({ ...r, source: 'youtube' }))
}

async function performYouTubeInfo(url: string) {
  try {
    return await getVideoInfo(url)
  } catch {
    return null
  }
}

interface SourceSearchResult {
  url: string
  title: string
  artist?: string
  duration?: string
  audioUrl?: string | null
  thumbnail?: string | null
  source: string
}

interface SourceInfo {
  title: string
  author: string
  duration: string
  audioUrl: string | null
  thumbnail: string | null
}

interface SourceResult {
  info: SourceInfo
  source: string
}

function titleMatches(expectedTitle: string, expectedArtist: string, foundTitle: string, foundAuthor?: string): boolean {
  const t = expectedTitle.toLowerCase().trim()
  const a = expectedArtist.toLowerCase().trim()
  const ft = foundTitle.toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim()
  const fa = (foundAuthor || '').toLowerCase().trim()

  if (t.length === 0) return true
  if (!ft.includes(t)) return false
  if (a.length === 0) return true
  return ft.includes(a) || fa.includes(a)
}

describe('titleMatches', () => {
  it('matches exact title and artist', () => {
    expect(titleMatches('Bohemian Rhapsody', 'Queen', 'Bohemian Rhapsody', 'Queen')).toBe(true)
  })

  it('matches with case insensitivity', () => {
    expect(titleMatches('bohemian rhapsody', 'queen', 'BOHEMIAN RHAPSODY', 'QUEEN')).toBe(true)
  })

  it('matches when found title contains extra info in parens', () => {
    expect(titleMatches('Bohemian Rhapsody', 'Queen', 'Bohemian Rhapsody (Official Video)', 'Queen')).toBe(true)
  })

  it('matches when found title contains extra info in brackets', () => {
    expect(titleMatches('Shape of You', 'Ed Sheeran', 'Shape of You [Official Lyric Video]', 'Ed Sheeran')).toBe(true)
  })

  it('rejects when title does not match', () => {
    expect(titleMatches('Bohemian Rhapsody', 'Queen', 'Another One Bites the Dust', 'Queen')).toBe(false)
  })

  it('matches when artist is empty (ignore artist check)', () => {
    expect(titleMatches('Bohemian Rhapsody', '', 'Bohemian Rhapsody', 'Queen')).toBe(true)
  })

  it('matches when title is empty (wildcard)', () => {
    expect(titleMatches('', 'Queen', 'Anything At All', 'Queen')).toBe(true)
  })

  it('rejects when artist does not match', () => {
    expect(titleMatches('Hello', 'Adele', 'Hello', 'Lionel Richie')).toBe(false)
  })
})

describe('findAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateCache()
  })

  it('returns result from youtube when it succeeds first', async () => {
    vi.mocked(searchYouTube).mockResolvedValue([
      { videoId: 'abc123', title: 'Test Song', url: 'https://youtube.com/watch?v=abc123' },
    ])
    vi.mocked(getVideoInfo).mockResolvedValue({
      title: 'Test Song', author: 'Test Artist', duration: '180', audioUrl: 'https://audio.url', thumbnail: null,
    })

    const { findAudio } = await import('./sources')

    const result = await findAudio('Test Song Test Artist')
    expect(result.source).toBe('youtube')
    expect(result.info.audioUrl).toBe('https://audio.url')
  })

  it('falls through to next source when youtube fails', async () => {
    vi.mocked(searchYouTube).mockResolvedValue([])

    const { findAudio } = await import('./sources')

    // Should throw since no source works
    await expect(findAudio('No Results')).rejects.toThrow('No audio found')
  })

  it('applies title matching filter', async () => {
    vi.mocked(searchYouTube).mockResolvedValue([
      { videoId: 'abc', title: 'Wrong Song', url: 'https://youtube.com/watch?v=abc' },
      { videoId: 'def', title: 'Expected Title', url: 'https://youtube.com/watch?v=def' },
    ])
    vi.mocked(getVideoInfo).mockImplementation(async (url: string) => {
      if (url.includes('def')) {
        return { title: 'Expected Title', author: 'Expected Artist', duration: '200', audioUrl: 'https://audio.url', thumbnail: null }
      }
      return { title: 'Wrong Song', author: 'Other', duration: '100', audioUrl: null, thumbnail: null }
    })

    const { findAudio } = await import('./sources')

    const result = await findAudio('Test Query', 'Expected Title', 'Expected Artist')
    expect(result.source).toBe('youtube')
    expect(result.info.title).toBe('Expected Title')
  })

  it('cached resolution short-circuits the network entirely', async () => {
    vi.mocked(searchYouTube).mockResolvedValue([
      { videoId: 'abc', title: 'Expected Title', url: 'https://youtube.com/watch?v=abc' },
    ])
    vi.mocked(getVideoInfo).mockResolvedValue({
      title: 'Expected Title', author: 'Expected Artist', duration: '200', audioUrl: 'https://audio.url', thumbnail: null,
    })

    const { findAudio } = await import('./sources')

    const r1 = await findAudio('Test Query', 'Expected Title', 'Expected Artist')
    expect(r1.source).toBe('youtube')
    expect(searchYouTube).toHaveBeenCalled()

    vi.mocked(searchYouTube).mockClear()

    const r2 = await findAudio('Test Query', 'Expected Title', 'Expected Artist')
    expect(r2.source).toBe('youtube')
    expect(r2.info.audioUrl).toBe('https://audio.url')
    expect(searchYouTube).not.toHaveBeenCalled()
  })

  it('cached resolution is bypassed when expectedArtist or expectedTitle is missing', async () => {
    vi.mocked(searchYouTube).mockResolvedValue([
      { videoId: 'abc', title: 'Some Song', url: 'https://youtube.com/watch?v=abc' },
    ])
    vi.mocked(getVideoInfo).mockResolvedValue({
      title: 'Some Song', author: 'Artist', duration: '180', audioUrl: 'https://audio.url', thumbnail: null,
    })

    const { findAudio } = await import('./sources')

    await findAudio('Some Song')
    expect(searchYouTube).toHaveBeenCalled()

    vi.mocked(searchYouTube).mockClear()
    vi.mocked(getVideoInfo).mockClear()

    await findAudio('Some Song')
    expect(searchYouTube).toHaveBeenCalled()
  })
})

  it('prefers a full-length match over a Deezer preview', async () => {
    vi.mocked(searchYouTube).mockResolvedValue([
      { videoId: 'full1', title: 'Test Song', url: 'https://youtube.com/watch?v=full1' },
    ])
    vi.mocked(getVideoInfo).mockResolvedValue({
      title: 'Test Song', author: 'Test Artist', duration: '240', audioUrl: 'https://audio.youtube/full', thumbnail: null,
    })

    const { findAudio } = await import('./sources')

    const result = await findAudio('Test Query', 'Test Song', 'Test Artist')
    expect(result.source).toBe('youtube')
    expect(result.isPreview).toBeUndefined()
    expect(result.info.audioUrl).toBe('https://audio.youtube/full')
  })

  it('falls back to Deezer preview when no full source works', async () => {
    vi.mocked(searchYouTube).mockResolvedValue([])
    vi.mocked(searchDeezer).mockResolvedValue([
      { id: 456, title: 'Preview Song', artist: 'Preview Artist', album: 'Album', duration: '30', isrc: null, thumbnail: null, preview: 'https://audio.deezer/preview', audioUrl: null, isPreview: true, source: 'deezer' },
    ])

    const { findAudio } = await import('./sources')

    const result = await findAudio('Search Query', 'Preview Song', 'Preview Artist')
    expect(result.isPreview).toBe(true)
    expect(result.source).toBe('deezer')
    expect(result.info.audioUrl).toBe('https://audio.deezer/preview')
  })

  it('rejects a low-confidence Deezer preview instead of treating it as the track', async () => {
    vi.mocked(searchYouTube).mockResolvedValue([])
    vi.mocked(searchDeezer).mockResolvedValue([
      { id: 789, title: 'Completely Different', artist: 'Ghost Artist', album: 'Album', duration: '30', isrc: null, thumbnail: null, preview: 'https://audio.deezer/wrong-preview', audioUrl: null, isPreview: true, source: 'deezer' },
    ])

    const { findAudio } = await import('./sources')

    await expect(findAudio('Search Query', 'Wrong Preview Song', 'Ghost Artist')).rejects.toThrow('No audio found')
  })

  it('caps concurrent searches per source during parallel downloads', async () => {
    let inFlight = 0
    let maxInFlight = 0
    vi.mocked(searchYouTube).mockImplementation(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(r => setTimeout(r, 30))
      inFlight--
      return []
    })
    vi.mocked(searchDeezer).mockResolvedValue([])

    const { findAudio } = await import('./sources')

    await Promise.allSettled([
      findAudio('Query Alpha', 'Track Alpha', 'Artist Alpha'),
      findAudio('Query Bravo', 'Track Bravo', 'Artist Bravo'),
      findAudio('Query Charlie', 'Track Charlie', 'Artist Charlie'),
    ])

    expect(maxInFlight).toBeLessThanOrEqual(2)
    expect(maxInFlight).toBeGreaterThan(0)
  })

  it('re-resolves when quality settings change (cache key includes quality/format)', async () => {
    const storage = new Map<string, string>()
    const localStorageMock = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => { storage.set(k, v) },
      removeItem: (k: string) => { storage.delete(k) },
      clear: () => { storage.clear() },
      key: () => null,
      length: 0,
    }
    vi.stubGlobal('localStorage', localStorageMock)
    const { setQualitySettings } = await import('./qualitySettings')
    const { findAudio } = await import('./sources')
    try {
      vi.mocked(searchYouTube).mockClear()
      vi.mocked(searchYouTube).mockResolvedValue([
        { url: 'https://youtube.com/watch?v=abc123def45', title: 'Quality Song', author: 'Quality Artist', source: 'youtube' },
      ])
      vi.mocked(searchDeezer).mockClear()
      vi.mocked(searchDeezer).mockResolvedValue([])

      await findAudio('Quality Query', 'Quality Song', 'Quality Artist')
      expect(vi.mocked(searchYouTube)).toHaveBeenCalledTimes(1)

      setQualitySettings({ bitrate: '128', format: 'm4a' })
      await findAudio('Quality Query', 'Quality Song', 'Quality Artist')
      expect(vi.mocked(searchYouTube)).toHaveBeenCalledTimes(2)

      await findAudio('Quality Query', 'Quality Song', 'Quality Artist')
      expect(vi.mocked(searchYouTube)).toHaveBeenCalledTimes(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })

describe('source list integrity', () => {
  it('has no two entries sharing the same search or info implementation', async () => {
    const { SOURCE_LIST } = await import('./sources')

    const names = SOURCE_LIST.map(s => s.name)
    expect(new Set(names).size).toBe(names.length)

    const searchImpls = SOURCE_LIST.map(s => s.search)
    expect(new Set(searchImpls).size).toBe(searchImpls.length)

    const infoImpls = SOURCE_LIST.map(s => s.info)
    expect(new Set(infoImpls).size).toBe(infoImpls.length)
  })

  it('registers each source exactly once', async () => {
    const { SOURCE_LIST } = await import('./sources')

    expect(SOURCE_LIST.map(s => s.name).sort()).toEqual([
      'audius',
      'bandcamp',
      'deezer',
      'fma',
      'invidious',
      'jamendo',
      'soundcloud',
      'youtube',
    ])
  })
})

describe('findAudioFromUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles a direct YouTube URL', async () => {
    vi.mocked(getVideoInfo).mockResolvedValue({
      title: 'YT Video', author: 'Creator', duration: '300', audioUrl: 'https://audio.url', thumbnail: null,
    })

    const { findAudioFromUrl } = await import('./sources')

    const result = await findAudioFromUrl('https://youtube.com/watch?v=abc123')
    expect(result.source).toBe('youtube')
    expect(result.info.title).toBe('YT Video')
  })

  it('handles a youtu.be short URL', async () => {
    vi.mocked(getVideoInfo).mockResolvedValue({
      title: 'Short Link', author: 'Creator', duration: '120', audioUrl: 'https://audio.url', thumbnail: null,
    })

    const { findAudioFromUrl } = await import('./sources')

    const result = await findAudioFromUrl('https://youtu.be/abc123')
    expect(result.source).toBe('youtube')
  })

  it('throws for unsupported URLs', async () => {
    const { findAudioFromUrl } = await import('./sources')

    await expect(findAudioFromUrl('https://example.com')).rejects.toThrow('Unsupported URL')
  })
})
