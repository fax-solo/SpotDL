import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractEmbeddedArtwork } from './localMusic'

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
    convertFileSrc: vi.fn((path: string) => `http://localhost/_capacitor_file_${path}`),
  },
}))

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    readFile: vi.fn(),
  },
}))

vi.mock('./dbCache', () => ({
  getCachedArtwork: vi.fn().mockResolvedValue(null),
  cacheArtwork: vi.fn().mockResolvedValue(undefined),
}))

describe('extractEmbeddedArtwork', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when file cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const { Filesystem } = await import('@capacitor/filesystem')
    vi.mocked(Filesystem.readFile as any).mockRejectedValue(new Error('No such file'))

    const result = await extractEmbeddedArtwork('/nonexistent/file.mp3')
    expect(result).toBeNull()
  })

  it('returns null when file has no ID3 header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 206,
      arrayBuffer: () => Promise.resolve(new Uint8Array([0xff, 0xfb, 0x90, 0x00]).buffer),
    }))

    const result = await extractEmbeddedArtwork('/test/song.mp3')
    expect(result).toBeNull()
  })

  it('extracts APIC frame from ID3v2 tagged MP3', async () => {
    const imageData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
    const descNull = new Uint8Array([0x00])
    const picType = new Uint8Array([0x03])
    const mimeType = new TextEncoder().encode('image/jpeg\x00')
    const encoding = new Uint8Array([0x00])
    const framePayload = new Uint8Array([...encoding, ...mimeType, ...picType, ...descNull, ...imageData])
    const frameSize = framePayload.length
    const frameHeader = new Uint8Array([
      ...new TextEncoder().encode('APIC'),
      (frameSize >> 24) & 0xff, (frameSize >> 16) & 0xff,
      (frameSize >> 8) & 0xff, frameSize & 0xff,
      0x00, 0x00,
    ])
    const framesData = new Uint8Array([...frameHeader, ...framePayload])
    const tagSize = framesData.length
    function toSyncsafe(n: number, offset: number): number {
      return ((n >> (3 - offset) * 7) & 0x7f)
    }
    const id3Header = new Uint8Array([
      0x49, 0x44, 0x33, 0x04, 0x00, 0x00,
      toSyncsafe(tagSize, 0), toSyncsafe(tagSize, 1),
      toSyncsafe(tagSize, 2), toSyncsafe(tagSize, 3),
    ])

    const combined = new Uint8Array([...id3Header, ...framesData])

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 206,
      arrayBuffer: () => Promise.resolve(combined.buffer),
    }))

    const result = await extractEmbeddedArtwork('/test/cover.mp3')
    expect(result).toBeTruthy()
    expect(result).toMatch(/^blob:/)
  })

  it('extracts cover art from M4A file with covr atom', async () => {
    function makeBox(type: string, data: Uint8Array): Uint8Array {
      const size = 8 + data.length
      const header = new Uint8Array(8)
      header[0] = (size >> 24) & 0xff
      header[1] = (size >> 16) & 0xff
      header[2] = (size >> 8) & 0xff
      header[3] = size & 0xff
      header.set(new TextEncoder().encode(type), 4)
      return new Uint8Array([...header, ...data])
    }

    const imageData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    const dataBox = makeBox('data', new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, ...imageData]))
    const covrBox = makeBox('covr', dataBox)
    const ilstBox = makeBox('ilst', covrBox)
    const metaBox = makeBox('meta', new Uint8Array([0x00, 0x00, 0x00, 0x00, ...ilstBox]))
    const moovBox = makeBox('moov', metaBox)
    const ftypBox = makeBox('ftyp', new Uint8Array([0x69, 0x73, 0x6f, 0x6d]))

    const file = new Uint8Array([...ftypBox, ...moovBox])

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 206,
      arrayBuffer: () => Promise.resolve(file.buffer),
    }))

    const result = await extractEmbeddedArtwork('/test/cover.m4a')
    expect(result).toBeTruthy()
    expect(result).toMatch(/^blob:/)
  })

  it('returns null for file with no embedded artwork', async () => {
    const framePayload = new TextEncoder().encode('\x00Test Title')
    const frameSize = framePayload.length
    const frameHeader = new Uint8Array([
      ...new TextEncoder().encode('TIT2'),
      (frameSize >> 24) & 0xff, (frameSize >> 16) & 0xff,
      (frameSize >> 8) & 0xff, frameSize & 0xff,
      0x00, 0x00,
    ])
    const framesData = new Uint8Array([...frameHeader, ...framePayload])
    const tagSize = framesData.length
    const id3Header = new Uint8Array([
      0x49, 0x44, 0x33, 0x04, 0x00, 0x00,
      ((tagSize >> 21) & 0x7f), ((tagSize >> 14) & 0x7f),
      ((tagSize >> 7) & 0x7f), (tagSize & 0x7f),
    ])

    const combined = new Uint8Array([...id3Header, ...framesData])

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 206,
      arrayBuffer: () => Promise.resolve(combined.buffer),
    }))

    const result = await extractEmbeddedArtwork('/test/noart.mp3')
    expect(result).toBeNull()
  })
})
