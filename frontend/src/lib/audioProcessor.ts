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
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching audio`)
  const contentLength = response.headers.get('Content-Length')
  const total = contentLength ? parseInt(contentLength, 10) : null
  if (!response.body) {
    const buf = await response.arrayBuffer()
    return new Uint8Array(buf)
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  if (total !== null) {
    onDownloadProgress?.(0)
  } else {
    onDownloadProgress?.(null)
  }
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    if (total !== null) {
      onDownloadProgress?.(Math.min(loaded / total, 1))
    }
  }
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
  const result = new Uint8Array(totalLength)
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

  const inputName = 'input'
  const coverName = 'cover.jpg'
  const ext = quality.format === 'm4a' ? 'm4a' : 'mp3'
  const outputName = `output.${ext}`

  try {
    const data = signal
      ? await fetchWithProgress(audioUrl, onDownloadProgress, signal)
      : await fetchWithProgress(audioUrl, onDownloadProgress)
    await instance.writeFile(inputName, data)

      const filterArgs = audioFilterArgs(quality.variant)
      if (quality.format === 'mp3') {
        await instance.exec([
          '-i', inputName,
          ...filterArgs,
          '-c:a', 'libmp3lame',
          '-b:a', `${quality.bitrate}k`,
          '-id3v2_version', '3',
          '-y', outputName,
        ])
    } else {
      let hasCover = false
      if (coverUrl) {
        try {
          const coverData = new Uint8Array(await (await fetch(coverUrl)).arrayBuffer())
          await instance.writeFile(coverName, coverData)
          hasCover = true
        } catch {}
      }

      const args = ['-i', inputName]
      if (hasCover) {
        args.push('-i', coverName)
      }
      args.push(
        '-map', hasCover ? '0:a' : '0:a',
      )
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
      await instance.exec(args)
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
  }
): Promise<Blob> {
  const { default: ID3Writer } = await import('browser-id3-writer')

  const writer = new ID3Writer(mp3Buffer)
  writer.setFrame('TIT2', metadata.title)
  writer.setFrame('TPE1', [metadata.artist])
  writer.setFrame('TALB', metadata.album)
  writer.setFrame('COMM', {
    description: 'Downloaded by Sinc',
    text: 'sinc.app',
  })

  if (metadata.artworkUrl) {
    try {
      const res = await fetch(metadata.artworkUrl)
      if (res.ok) {
        const coverBlob = await res.blob()
        writer.setFrame('APIC', {
          type: 3,
          data: await coverBlob.arrayBuffer(),
          description: 'Cover',
          useUnicodeEncoding: false,
        })
      }
    } catch {
    }
  }

  const tagged = await writer.addTag()
  return new Blob([tagged], { type: 'audio/mpeg' })
}

export async function downloadAudio(
  audioUrl: string,
  metadata: {
    title: string
    artist: string
    album: string
    artworkUrl: string | null
  },
  onProgress?: (pct: number) => void,
  onDownloadProgress?: (pct: number | null) => void,
  signal?: AbortSignal,
  quality?: QualitySettings,
  durationMs?: number,
): Promise<Blob> {
  const q = quality || { bitrate: '320', format: 'mp3' }
  signal?.throwIfAborted()
  const audioData = await convertAudio(audioUrl, q, metadata.artworkUrl || undefined, onProgress, signal, onDownloadProgress, durationMs)
  signal?.throwIfAborted()

  if (q.format === 'mp3') {
    try {
      const taggedBlob = await writeId3Tags(audioData, metadata)
      return taggedBlob
    } catch (err) {
      console.warn('[audioProcessor] writeId3Tags failed, returning untagged MP3:', err)
      return new Blob([audioData], { type: 'audio/mpeg' })
    }
  }

  return new Blob([audioData], { type: 'audio/mp4' })
}
