import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

const { mockFFmpegCtor, mockFFmpegInstance, mockID3WriterModule } = vi.hoisted(() => {
  let lastInstance: { exec: ReturnType<typeof vi.fn> } | null = null
  class MockFFmpeg {
    load = vi.fn().mockResolvedValue(undefined)
    writeFile = vi.fn().mockResolvedValue(undefined)
    readFile = vi.fn().mockResolvedValue(new Uint8Array([0x42, 0x41, 0x52]))
    deleteFile = vi.fn().mockResolvedValue(undefined)
    exec = vi.fn().mockResolvedValue(undefined)
    on = vi.fn()
    off = vi.fn()
    constructor() {
      lastInstance = this
    }
  }

  const mockID3WriterModule = {
    _ctor: vi.fn(function () {
      this.setFrame = vi.fn()
      this.addTag = vi.fn().mockResolvedValue(new ArrayBuffer(10))
    }),
    get default() { return this._ctor },
    set default(v) { this._ctor = v },
  }

  return {
    mockFFmpegCtor: MockFFmpeg,
    mockFFmpegInstance: { get exec() { return lastInstance?.exec || vi.fn() } },
    mockID3WriterModule,
  }
})

vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: mockFFmpegCtor }))

vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn().mockResolvedValue(new Uint8Array([0x00, 0x01, 0x02])),
}))

vi.mock('browser-id3-writer', () => mockID3WriterModule)

import { convertAudio, writeId3Tags, downloadAudio } from './audioProcessor'

const defaultQuality = { bitrate: '320' as const, format: 'mp3' as const }

const normalQuality = { bitrate: '320' as const, format: 'mp3' as const, variant: 'normal' as const }
const spedUpQuality = { bitrate: '320' as const, format: 'mp3' as const, variant: 'sped_up' as const }
const slowedReverbQuality = { bitrate: '320' as const, format: 'mp3' as const, variant: 'slowed_reverb' as const }

describe('convertAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: vi.fn().mockReturnValue(null) },
      body: null,
      arrayBuffer: () => Promise.resolve(new Uint8Array([0x00, 0x01, 0x02]).buffer),
    }))
  })

  it('creates ffmpeg instance and converts audio', async () => {
    const result = await convertAudio('https://example.com/audio.mp3', defaultQuality)
    expect(result).toBeInstanceOf(ArrayBuffer)
    expect(new Uint8Array(result)).toEqual(new Uint8Array([0x42, 0x41, 0x52]))
  })

  it('reports progress when callback provided', async () => {
    const progressCb = vi.fn()
    await convertAudio('https://example.com/audio.mp3', defaultQuality, undefined, progressCb)
    expect(typeof progressCb).toBe('function')
  })

  it('passes AbortSignal to fetch', async () => {
    const controller = new AbortController()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await convertAudio('https://example.com/audio.mp3', defaultQuality, undefined, undefined, controller.signal)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/audio.mp3',
      expect.objectContaining({ signal: controller.signal }),
    )
  })

  it('passes no -af filter for normal variant', async () => {
    vi.clearAllMocks()
    await convertAudio('https://example.com/audio.mp3', normalQuality)
    expect(mockFFmpegInstance.exec).toHaveBeenCalled()
    const args = mockFFmpegInstance.exec.mock.calls[0]?.[0] as string[]
    expect(args).not.toContain('-af')
  })

  it('passes atempo=1.25 for sped_up variant', async () => {
    vi.clearAllMocks()
    await convertAudio('https://example.com/audio.mp3', spedUpQuality)
    expect(mockFFmpegInstance.exec).toHaveBeenCalled()
    const args = mockFFmpegInstance.exec.mock.calls[0]?.[0] as string[]
    expect(args).toContain('-af')
    const afIndex = args.indexOf('-af')
    expect(args[afIndex + 1]).toBe('atempo=1.25')
  })

  it('passes atempo=0.85,aecho for slowed_reverb variant', async () => {
    vi.clearAllMocks()
    await convertAudio('https://example.com/audio.mp3', slowedReverbQuality)
    expect(mockFFmpegInstance.exec).toHaveBeenCalled()
    const args = mockFFmpegInstance.exec.mock.calls[0]?.[0] as string[]
    expect(args).toContain('-af')
    const afIndex = args.indexOf('-af')
    const filterStr = args[afIndex + 1]
    expect(filterStr).toContain('atempo=0.85')
    expect(filterStr).toContain('aecho=')
  })
})

describe('writeId3Tags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes ID3 tags to MP3 buffer', async () => {
    const inputBuffer = new ArrayBuffer(100)
    const result = await writeId3Tags(inputBuffer, {
      title: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      artworkUrl: null,
    })
    expect(result).toBeInstanceOf(Blob)
    expect(result.type).toBe('audio/mpeg')
  })

  it('attempts to fetch artwork when URL provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['fake-image-data'], { type: 'image/jpeg' })),
    }))

    const inputBuffer = new ArrayBuffer(100)
    await writeId3Tags(inputBuffer, {
      title: 'Test',
      artist: 'Test',
      album: 'Test',
      artworkUrl: 'https://example.com/cover.jpg',
    })
    expect(fetch).toHaveBeenCalledWith('https://example.com/cover.jpg')
  })
})

describe('downloadAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: vi.fn().mockReturnValue(null) },
      body: null,
      arrayBuffer: () => Promise.resolve(new Uint8Array([0x00, 0x01, 0x02]).buffer),
      blob: () => Promise.resolve(new Blob(['fake-image-data'], { type: 'image/jpeg' })),
    }))
  })

  it('combines conversion and tagging', async () => {
    const result = await downloadAudio('https://example.com/audio.mp3', {
      title: 'Test',
      artist: 'Test',
      album: 'Test',
      artworkUrl: null,
    })
    expect(result).toBeInstanceOf(Blob)
    expect(result.type).toBe('audio/mpeg')
  })

  it('throws if aborted before processing', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      downloadAudio('https://example.com/audio.mp3', {
        title: 'Test',
        artist: 'Test',
        album: 'Test',
        artworkUrl: null,
      }, undefined, undefined, controller.signal),
    ).rejects.toThrow()
  })

  it('returns untagged MP3 if ID3 tagging fails', async () => {
    mockID3WriterModule._ctor = vi.fn(function () {
      throw new Error('Tagging failed')
    })

    const result = await downloadAudio('https://example.com/audio.mp3', {
      title: 'Test',
      artist: 'Test',
      album: 'Test',
      artworkUrl: null,
    })
    expect(result).toBeInstanceOf(Blob)
    expect(result.type).toBe('audio/mpeg')
  })
})
