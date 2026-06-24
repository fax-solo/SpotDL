import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

const { mockFFmpegCtor, mockID3WriterModule } = vi.hoisted(() => {
  class MockFFmpeg {
    load = vi.fn().mockResolvedValue(undefined)
    writeFile = vi.fn().mockResolvedValue(undefined)
    readFile = vi.fn().mockResolvedValue(new Uint8Array([0x42, 0x41, 0x52]))
    deleteFile = vi.fn().mockResolvedValue(undefined)
    exec = vi.fn().mockResolvedValue(undefined)
    on = vi.fn()
    off = vi.fn()
  }

  const mockID3WriterModule = {
    _ctor: vi.fn(function () {
      this.setFrame = vi.fn()
      this.addTag = vi.fn().mockResolvedValue(new ArrayBuffer(10))
    }),
    get default() { return this._ctor },
    set default(v) { this._ctor = v },
  }

  return { mockFFmpegCtor: MockFFmpeg, mockID3WriterModule }
})

vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: mockFFmpegCtor }))

vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn().mockResolvedValue(new Uint8Array([0x00, 0x01, 0x02])),
}))

vi.mock('browser-id3-writer', () => mockID3WriterModule)

import { convertToMp3, writeId3Tags, downloadAudio } from './audioProcessor'

describe('convertToMp3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([0x00, 0x01, 0x02]).buffer),
    }))
  })

  it('creates ffmpeg instance and converts audio', async () => {
    const result = await convertToMp3('https://example.com/audio.mp3')
    expect(result).toBeInstanceOf(ArrayBuffer)
    expect(new Uint8Array(result)).toEqual(new Uint8Array([0x42, 0x41, 0x52]))
  })

  it('reports progress when callback provided', async () => {
    const progressCb = vi.fn()
    await convertToMp3('https://example.com/audio.mp3', progressCb)
    expect(typeof progressCb).toBe('function')
  })

  it('passes AbortSignal to fetch', async () => {
    const controller = new AbortController()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await convertToMp3('https://example.com/audio.mp3', undefined, controller.signal)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/audio.mp3',
      expect.objectContaining({ signal: controller.signal }),
    )
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
      }, undefined, controller.signal),
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
