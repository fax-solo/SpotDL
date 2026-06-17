import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

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

export async function convertToMp3(audioUrl: string, onProgress?: (pct: number) => void, signal?: AbortSignal): Promise<ArrayBuffer> {
  const instance = await getFFmpeg()

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.round(progress * 100))
  }

  if (onProgress) {
    instance.on?.('progress', progressHandler)
  }

  const inputName = 'input'
  const outputName = 'output.mp3'

  try {
    const data = signal
      ? new Uint8Array(await (await fetch(audioUrl, { signal })).arrayBuffer())
      : await fetchFile(audioUrl)
    await instance.writeFile(inputName, data)

    await instance.exec([
      '-i', inputName,
      '-c:a', 'libmp3lame',
      '-b:a', '320k',
      '-id3v2_version', '3',
      '-y', outputName,
    ])

    const outData = await instance.readFile(outputName) as Uint8Array
    return outData.slice().buffer
  } finally {
    if (onProgress) {
      instance.off?.('progress', progressHandler)
    }
    // Clean up temp files from FFmpeg virtual FS to prevent WASM memory leak
    try { await instance.deleteFile(inputName) } catch { /* ignore */ }
    try { await instance.deleteFile(outputName) } catch { /* ignore */ }
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
    description: 'Downloaded by SpotDL',
    text: 'spotdl.app',
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
): Promise<Blob> {
  signal?.throwIfAborted()
  const mp3Data = await convertToMp3(audioUrl, onProgress, signal)
  signal?.throwIfAborted()
  const taggedBlob = await writeId3Tags(mp3Data, metadata)
  return taggedBlob
}
