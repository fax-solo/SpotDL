import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import type { QualitySettings } from './qualitySettings'

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
      ffmpeg = new FFmpeg() as FfmpegInstance
      await ffmpeg.load()
    })()
  }
  await loading
  return ffmpeg!
}

export async function convertAudio(
  audioUrl: string,
  quality: QualitySettings,
  coverUrl?: string,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const instance = await getFFmpeg()

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.round(progress * 100))
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
      ? new Uint8Array(await (await fetch(audioUrl, { signal })).arrayBuffer())
      : await fetchFile(audioUrl)
    await instance.writeFile(inputName, data)

    if (quality.format === 'mp3') {
      await instance.exec([
        '-i', inputName,
        '-c:a', 'libmp3lame',
        '-b:a', `${quality.bitrate}k`,
        '-id3v2_version', '3',
        '-y', outputName,
      ])
    } else {
      // For M4A, try to embed cover art and metadata in one pass
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
  signal?: AbortSignal,
  quality?: QualitySettings,
): Promise<Blob> {
  const q = quality || { bitrate: '320', format: 'mp3' }
  signal?.throwIfAborted()
  const audioData = await convertAudio(audioUrl, q, metadata.artworkUrl || undefined, onProgress, signal)
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
