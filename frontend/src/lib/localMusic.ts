import { Capacitor } from '@capacitor/core'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus'])

const COMMON_AUDIO_DIRS = [
  'Music/',
  'Download/',
  'Podcasts/',
  'Ringtones/',
  'Notifications/',
  'Alarms/',
  'Audiobooks/',
  'Recordings/',
  'Sound/',
  'audio/',
  'Voice/',
]

export interface LocalTrack {
  name: string
  path: string
  uri: string
  size: number
  mtime: number
}

async function readDir(path: string, depth: number): Promise<string[]> {
  if (depth > 3) return []
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const result = await Filesystem.readdir({
    path,
    directory: Directory.ExternalStorage,
  })
  const files: string[] = []
  for (const entry of result.files) {
    const fullPath = path ? `${path}/${entry.name}` : entry.name
    if (entry.type === 'file' && isAudioFile(entry.name)) {
      files.push(fullPath)
    } else if (entry.type === 'directory') {
      const sub = await readDir(fullPath, depth + 1).catch(() => [])
      files.push(...sub)
    }
  }
  return files
}

function trackFromPath(path: string): LocalTrack {
  const name = path.split('/').pop() || path
  return {
    name: name.replace(/\.[^/.]+$/, ''),
    path,
    uri: Capacitor.convertFileSrc(path),
    size: 0,
    mtime: 0,
  }
}

export async function scanDeviceMusic(): Promise<LocalTrack[]> {
  if (!Capacitor.isNativePlatform()) return []

  const seen = new Set<string>()
  const all: LocalTrack[] = []

  const addTrack = (t: LocalTrack) => {
    if (!seen.has(t.path)) {
      seen.add(t.path)
      all.push(t)
    }
  }

  // Scan common directories
  for (const dir of COMMON_AUDIO_DIRS) {
    try {
      const files = await readDir(dir, 0)
      for (const f of files) addTrack(trackFromPath(f))
    } catch {
      // skip inaccessible directories
    }
  }

  // Also scan from root (depth 1 only — immediate files, no deep recursion)
  try {
    const rootFiles = await readDir('', 0)
    for (const f of rootFiles) {
      if (f.split('/').length <= 2) addTrack(trackFromPath(f))
    }
  } catch {
    // root may not be accessible
  }

  all.sort((a, b) => a.name.localeCompare(b.name))
  return all
}

export function isAudioFile(name: string): boolean {
  const ext = name.substring(name.lastIndexOf('.')).toLowerCase()
  return AUDIO_EXTENSIONS.has(ext)
}
