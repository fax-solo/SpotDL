import { Capacitor } from '@capacitor/core'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus'])

export interface LocalTrack {
  name: string
  path: string
  uri: string
  size: number
  mtime: number
}

export async function scanDeviceMusic(): Promise<LocalTrack[]> {
  if (!Capacitor.isNativePlatform()) return []

  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const musicDir = await Filesystem.readdir({
      path: 'Music/',
      directory: Directory.ExternalStorage,
    }).catch(() => null)

    if (!musicDir) return []

    const tracks: LocalTrack[] = []

    for (const file of musicDir.files) {
      if (file.type === 'file' && isAudioFile(file.name)) {
        const uri = Capacitor.convertFileSrc(file.uri || '')
        tracks.push({
          name: file.name.replace(/\.[^/.]+$/, ''),
          path: file.uri || file.name,
          uri,
          size: file.size || 0,
          mtime: file.mtime || 0,
        })
      }
    }

    tracks.sort((a, b) => a.name.localeCompare(b.name))
    return tracks
  } catch {
    return []
  }
}

export async function scanDirectory(path: string): Promise<LocalTrack[]> {
  if (!Capacitor.isNativePlatform()) return []

  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const result = await Filesystem.readdir({
      path,
      directory: Directory.ExternalStorage,
    })

    const tracks: LocalTrack[] = []

    for (const file of result.files) {
      if (file.type === 'file' && isAudioFile(file.name)) {
        const fullPath = path ? `${path}/${file.name}` : file.name
        const uri = Capacitor.convertFileSrc(file.uri || '')
        tracks.push({
          name: file.name.replace(/\.[^/.]+$/, ''),
          path: fullPath,
          uri,
          size: file.size || 0,
          mtime: file.mtime || 0,
        })
      } else if (file.type === 'directory') {
        const subPath = path ? `${path}/${file.name}` : file.name
        const sub = await scanDirectory(subPath).catch(() => [])
        tracks.push(...sub)
      }
    }

    return tracks
  } catch {
    return []
  }
}

export function isAudioFile(name: string): boolean {
  const ext = name.substring(name.lastIndexOf('.')).toLowerCase()
  return AUDIO_EXTENSIONS.has(ext)
}
