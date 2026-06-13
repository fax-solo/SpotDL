// @ts-nocheck
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

let ffmpeg: FFmpeg | null = null
let loading: Promise<void> | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg
  if (!loading) {
    loading = (async () => {
      ffmpeg = new FFmpeg()
      await ffmpeg.load()
    })()
  }
  await loading
  return ffmpeg
}

export async function convertToMp3(audioUrl: string, onProgress?: (pct: number) => void): Promise<ArrayBuffer> {
  const instance = await getFFmpeg()

  if (onProgress) {
    instance.on('progress', ({ progress }: { progress: number }) => {
      onProgress(Math.round(progress * 100))
    })
  }

  const inputName = 'input'
  const outputName = 'output.mp3'

  const data = await fetchFile(audioUrl)
  await instance.writeFile(inputName, data)

  await instance.exec([
    '-i', inputName,
    '-c:a', 'libmp3lame',
    '-b:a', '320k',
    '-id3v2_version', '3',
    '-y', outputName,
  ])

  const outData: Uint8Array = await instance.readFile(outputName)
  return outData.buffer
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

  writer.addTag()
  return writer.getBlob()
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
): Promise<Blob> {
  const mp3Data = await convertToMp3(audioUrl, onProgress)
  const taggedBlob = await writeId3Tags(mp3Data, metadata)
  return taggedBlob
}
