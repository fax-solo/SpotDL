import type { FFmpeg } from '@ffmpeg/ffmpeg'
import type { QualitySettings, AudioVariant } from './qualitySettings'

const SPED_UP_TEMPO = 1.25
const SLOWED_TEMPO = 0.85
const SLOWED_REVERB_DELAY = '0.8:0.9:1000:0.3'

function audioFilterArgs(variant?: AudioVariant): string[] {
  if (!variant || variant === 'normal') return []
  if (variant === 'sped_up') {
    return ['-af', `atempo=${SPED_UP_TEMPO}`]
  }
  return ['-af', `atempo=${SLOWED_TEMPO},aecho=${SLOWED_REVERB_DELAY}`]
}

type FfmpegInstance = FFmpeg & {
  on?: (event: string, cb: (...args: unknown[]) => void) => void
  off?: (event: string, cb: (...args: unknown[]) => void) => void
}

let ffmpeg: FfmpegInstance | null = null
let loading: Promise<void> | null = null

async function getFFmpeg(): Promise<FfmpegInstance> {
  if (ffmpeg) return ffmpeg
  if (!loading) {
    loading = (async () => {
      const { FFmpeg: FFmpegClass } = await import('@ffmpeg/ffmpeg')
      ffmpeg = new FFmpegClass() as FfmpegInstance
      await ffmpeg.load()
    })()
  }
  await loading
  return ffmpeg!
}

async function fetchWithProgress(
  url: string,
  onDownloadProgress?: (pct: number | null) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const response = await fetch(url, signal ? { signal } : {})
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching audio`)
  const contentLength = response.headers.get('Content-Length')
  const total = contentLength ? parseInt(contentLength, 10) : null
  if (!response.body) {
    const buf = await response.arrayBuffer()
    return new Uint8Array(buf)
  }
  const reader = response.body.getReader()
  onDownloadProgress?.(total !== null ? 0 : null)
  if (total !== null) {
    const result = new Uint8Array(total)
    let loaded = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result.set(value, loaded)
      loaded += value.length
      onDownloadProgress?.(Math.min(loaded / total, 1))
    }
    return result
  }
  const chunks: Uint8Array[] = []
  let loaded = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
  }
  const result = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

export async function convertAudio(
  audioUrl: string,
  quality: QualitySettings,
  coverUrl?: string,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
  onDownloadProgress?: (pct: number | null) => void,
  durationMs?: number,
): Promise<ArrayBuffer> {
  const instance = await getFFmpeg()
  const convertStartTime = Date.now()
  let hasNonZeroProgress = false

  const progressHandler = ({ progress }: { progress: number }) => {
    if (progress > 0) hasNonZeroProgress = true
    let ratio = typeof progress === 'number' ? progress : 0

    if (!hasNonZeroProgress && durationMs && durationMs > 0) {
      const elapsed = (Date.now() - convertStartTime) / 1000
      if (elapsed > 2) {
        const expectedDuration = durationMs / 1000
        const timeBased = Math.min(elapsed / expectedDuration, 0.9)
        ratio = Math.max(ratio, timeBased)
      }
    }

    onProgress?.(Math.round(Math.min(ratio, 1) * 100))
  }

    if (onProgress) {
      instance.on?.('progress', progressHandler)
    }

    const tag = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const inputName = `input_${tag}`
    const coverName = `cover_${tag}.jpg`
    const ext = quality.format === 'm4a' ? 'm4a' : 'mp3'
    const outputName = `output_${tag}.${ext}`


  async function execWithSignal(args: string[]): Promise<void> {
    if (signal) {
      await Promise.race([
        instance.exec(args),
        new Promise<void>((_, reject) => {
          const onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
          if (signal.aborted) { onAbort(); return }
          signal.addEventListener('abort', onAbort, { once: true })
        }),
      ])
    } else {
      await instance.exec(args)
    }
  }

  let coverPromise: Promise<Uint8Array | null> | null = null
  if (coverUrl && quality.format === 'm4a') {
    coverPromise = fetch(coverUrl, { signal: AbortSignal.timeout(10000) })
      .then(r => r.ok ? r.arrayBuffer().then(b => new Uint8Array(b)) : null)
      .catch(() => null)
  }

  try {
    const [data, coverData] = await Promise.all([
      signal
        ? fetchWithProgress(audioUrl, onDownloadProgress, signal)
        : fetchWithProgress(audioUrl, onDownloadProgress),
      coverPromise ?? Promise.resolve(null),
    ])

    await instance.writeFile(inputName, data)

    const filterArgs = audioFilterArgs(quality.variant)
    if (quality.format === 'mp3') {
      await execWithSignal([
        '-i', inputName,
        ...filterArgs,
        '-c:a', 'libmp3lame',
        '-b:a', `${quality.bitrate}k`,
        '-id3v2_version', '3',
        '-y', outputName,
      ])
    } else {
      let hasCover = false
      if (coverData) {
        try {
          await instance.writeFile(coverName, coverData)
          hasCover = true
        } catch (err) {
          console.warn('[audioProcessor] failed to write cover file for M4A, embedding skipped:', err)
        }
      }

      const args = ['-i', inputName]
      if (hasCover) {
        args.push('-i', coverName)
      }
      args.push('-map', '0:a')
      if (hasCover) {
        args.push('-map', '1:v', '-disposition:v', 'attached_pic')
      }
      args.push(
        ...filterArgs,
        '-c:a', 'aac',
        '-b:a', `${quality.bitrate}k`,
        '-movflags', '+faststart',
        '-y', outputName,
      )
      await execWithSignal(args)
    }

    const outData = await instance.readFile(outputName) as Uint8Array
    return outData.slice().buffer
  } finally {
    if (onProgress) {
      instance.off?.('progress', progressHandler)
    }
    try { await instance.deleteFile(inputName) } catch {}
    try { await instance.deleteFile(outputName) } catch {}
    try { await instance.deleteFile(coverName) } catch {}
  }
}

export async function writeId3Tags(
  mp3Buffer: ArrayBuffer,
  metadata: {
    title: string
    artist: string
    album: string
    artworkUrl: string | null
    lyrics?: string | null
  }
): Promise<{ blob: Blob; artworkEmbedded: boolean }> {
  const { default: ID3Writer } = await import('browser-id3-writer')

  const writer = new ID3Writer(mp3Buffer)
  writer.setFrame('TIT2', metadata.title)
  writer.setFrame('TPE1', [metadata.artist])
  writer.setFrame('TALB', metadata.album)
  writer.setFrame('COMM', {
    description: 'Downloaded by Sinc',
    text: 'sinc.app',
  })

  if (metadata.lyrics) {
    writer.setFrame('USLT', {
      description: '',
      lyrics: metadata.lyrics,
    })
  }

  let artworkEmbedded = false
  if (metadata.artworkUrl) {
    try {
      const res = await fetch(metadata.artworkUrl, { signal: AbortSignal.timeout(10000) })
      if (res.ok) {
        const coverBlob = await res.blob()
        writer.setFrame('APIC', {
          type: 3,
          data: await coverBlob.arrayBuffer(),
          description: 'Cover',
          useUnicodeEncoding: false,
        })
        artworkEmbedded = true
      }
    } catch (err) {
      console.warn('[audioProcessor] artwork fetch failed for ID3:', err)
    }
  }

  const tagged = await writer.addTag()
  return { blob: new Blob([tagged], { type: 'audio/mpeg' }), artworkEmbedded }
}

export async function writeM4ATags(
  m4aBuffer: ArrayBuffer,
  metadata: {
    title: string
    artist: string
    album: string
    artworkUrl: string | null
    lyrics?: string | null
  }
): Promise<{ blob: Blob; artworkEmbedded: boolean }> {
  const instance = await getFFmpeg()
  const tag = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
  const inputName = `input_${tag}.m4a`
  const coverName = `cover_${tag}.jpg`
  const outputName = `output_${tag}.m4a`

  let hasCover = false
  if (metadata.artworkUrl) {
    try {
      const res = await fetch(metadata.artworkUrl, { signal: AbortSignal.timeout(10000) })
      if (res.ok) {
        const coverData = new Uint8Array(await res.arrayBuffer())
        await instance.writeFile(inputName, new Uint8Array(m4aBuffer))
        await instance.writeFile(coverName, coverData)
        hasCover = true
      }
    } catch (err) {
      console.warn('[audioProcessor] artwork fetch failed for M4A:', err)
    }
  }

  try {
    if (!hasCover) {
      await instance.writeFile(inputName, new Uint8Array(m4aBuffer))
    }

    const args = []
    if (hasCover) {
      args.push('-i', coverName, '-i', inputName, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-disposition:v', 'attached_pic')
    } else {
      args.push('-i', inputName, '-c', 'copy')
    }
    args.push(
      '-metadata', `title=${metadata.title}`,
      '-metadata', `artist=${metadata.artist}`,
      '-metadata', `album=${metadata.album}`,
    )
    if (metadata.lyrics) {
      args.push('-metadata', `lyrics=${metadata.lyrics}`)
    }
    args.push('-y', outputName)

    await instance.exec(args)
    const outData = await instance.readFile(outputName) as Uint8Array
    return { blob: new Blob([outData.slice().buffer], { type: 'audio/mp4' }), artworkEmbedded: hasCover }
  } finally {
    try { await instance.deleteFile(inputName) } catch {}
    try { await instance.deleteFile(outputName) } catch {}
    try { await instance.deleteFile(coverName) } catch {}
  }
}

export async function downloadAudio(
  audioUrl: string,
  metadata: {
    title: string
    artist: string
    album: string
    artworkUrl: string | null
    lyrics?: string | null
  },
  onProgress?: (pct: number) => void,
  onDownloadProgress?: (pct: number | null) => void,
  signal?: AbortSignal,
  quality?: QualitySettings,
  durationMs?: number,
): Promise<{ blob: Blob; artworkEmbedded: boolean }> {
  const q = quality || { bitrate: '320', format: 'mp3' }
  signal?.throwIfAborted()
  const audioData = await convertAudio(audioUrl, q, metadata.artworkUrl || undefined, onProgress, signal, onDownloadProgress, durationMs)
  signal?.throwIfAborted()

  if (q.format === 'mp3') {
    try {
      const result = await writeId3Tags(audioData, metadata)
      return result
    } catch (err) {
      console.warn('[audioProcessor] writeId3Tags failed, returning untagged MP3:', err)
      return { blob: new Blob([audioData], { type: 'audio/mpeg' }), artworkEmbedded: false }
    }
  }

  try {
    const result = await writeM4ATags(audioData, metadata)
    return result
  } catch (err) {
    console.warn('[audioProcessor] writeM4ATags failed, returning untagged M4A:', err)
    return { blob: new Blob([audioData], { type: 'audio/mp4' }), artworkEmbedded: false }
  }
}

