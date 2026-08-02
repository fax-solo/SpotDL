import { Capacitor } from '@capacitor/core'
import { getCachedArtwork, cacheArtwork } from './dbCache'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus'])

const COMMON_AUDIO_DIRS = [
  'Music/',
  'Download/',
  'Documents/',
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
  artworkUrl?: string | null
}

function readFileChunk(path: string, maxBytes: number = 100 * 1024): Promise<Uint8Array | null> {
  return (async () => {
    try {
      const fileUrl = Capacitor.convertFileSrc(path)
      const res = await fetch(fileUrl, {
        headers: { Range: `bytes=0-${maxBytes - 1}` },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok || res.status === 206) {
        return new Uint8Array(await res.arrayBuffer())
      }
    } catch {
    }
    try {
      const { Filesystem } = await import('@capacitor/filesystem')
      const result = await Filesystem.readFile({ path })
      const binary = atob(result.data as string)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes.slice(0, maxBytes)
    } catch {
      return null
    }
  })()
}

function parseSyncsafeInt(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! & 0x7f) << 21) |
         ((bytes[offset + 1]! & 0x7f) << 14) |
         ((bytes[offset + 2]! & 0x7f) << 7) |
         (bytes[offset + 3]! & 0x7f)
}

function extractApicFromId3(data: Uint8Array): Uint8Array | null {
  if (data[0] !== 0x49 || data[1] !== 0x44 || data[2] !== 0x33) return null
  const tagSize = parseSyncsafeInt(data, 6)
  const end = Math.min(10 + tagSize, data.length)
  let pos = 10
  while (pos + 10 <= end) {
    const frameId = String.fromCharCode(data[pos]!, data[pos + 1]!, data[pos + 2]!, data[pos + 3]!)
    const frameSize = ((data[pos + 4]! << 24) | (data[pos + 5]! << 16) | (data[pos + 6]! << 8) | data[pos + 7]!)
    const frameEnd = pos + 10 + frameSize
    if (frameEnd > end) break
    if (frameId === 'APIC') {
      const encoding = data[pos + 10]!
      let mimeStart = pos + 11
      let mimeEnd = mimeStart
      while (mimeEnd < frameEnd && data[mimeEnd] !== 0) mimeEnd++
      mimeEnd++
      const picType = data[mimeEnd]!
      if (picType === 3) {
        let descEnd = mimeEnd + 1
        if (encoding === 0x01 || encoding === 0x02) {
          while (descEnd + 1 < frameEnd && (data[descEnd] !== 0 || data[descEnd + 1] !== 0)) descEnd += 2
          descEnd += 2
        } else {
          while (descEnd < frameEnd && data[descEnd] !== 0) descEnd++
          descEnd++
        }
        return data.slice(descEnd, frameEnd)
      }
    }
    pos = frameEnd
  }
  return null
}

function extractCoverFromMp4(data: Uint8Array): Uint8Array | null {
  let pos = 0
  while (pos + 8 <= data.length) {
    const boxSize = ((data[pos]! << 24) | (data[pos + 1]! << 16) | (data[pos + 2]! << 8) | data[pos + 3]!) >>> 0
    const boxType = String.fromCharCode(data[pos + 4]!, data[pos + 5]!, data[pos + 6]!, data[pos + 7]!)
    if (boxSize < 8 || boxSize > 50 * 1024 * 1024 || pos + boxSize > data.length) break
    if (boxType === 'moov' || boxType === 'udta' || boxType === 'meta') {
      const inner = extractCoverFromMp4(data.slice(pos + 8, pos + boxSize))
      if (inner) return inner
    }
    if (boxType === 'covr') {
      let innerPos = pos + 8
      while (innerPos + 8 <= pos + boxSize) {
        const innerSize = ((data[innerPos]! << 24) | (data[innerPos + 1]! << 16) | (data[innerPos + 2]! << 8) | data[innerPos + 3]!) >>> 0
        const innerType = String.fromCharCode(data[innerPos + 4]!, data[innerPos + 5]!, data[innerPos + 6]!, data[innerPos + 7]!)
        if (innerSize < 8 || innerPos + innerSize > pos + boxSize) break
        if (innerType === 'data') {
          return data.slice(innerPos + 16, innerPos + innerSize)
        }
        innerPos += innerSize
      }
    }
    pos += boxSize
  }
  return null
}

function findBox(data: Uint8Array, target: string): { data: Uint8Array; offset: number } | null {
  let pos = 0
  while (pos + 8 <= data.length) {
    const boxSize = ((data[pos]! << 24) | (data[pos + 1]! << 16) | (data[pos + 2]! << 8) | data[pos + 3]!) >>> 0
    const boxType = String.fromCharCode(data[pos + 4]!, data[pos + 5]!, data[pos + 6]!, data[pos + 7]!)
    if (boxSize < 8 || pos + boxSize > data.length) break
    if (boxType === target) return { data: data.slice(pos, pos + boxSize), offset: pos }
    pos += boxSize
  }
  return null
}

export async function extractEmbeddedArtwork(path: string): Promise<string | null> {
  const cachedBlob = await getCachedArtwork(path)
  if (cachedBlob) return URL.createObjectURL(cachedBlob)

  const chunk = await readFileChunk(path, 1024 * 1024)
  if (!chunk) return null

  let imageData: Uint8Array | null = null
  if (chunk[0] === 0x49 && chunk[1] === 0x44 && chunk[2] === 0x33) {
    imageData = extractApicFromId3(chunk)
  } else if (chunk[4] === 0x66 && chunk[5] === 0x74 && chunk[6] === 0x79 && chunk[7] === 0x70) {
    const moov = findBox(chunk, 'moov')
    if (moov) {
      const meta = findBox(moov.data.slice(8), 'meta')
      if (meta) {
        const ilst = findBox(meta.data.slice(12), 'ilst')
        if (ilst) {
          imageData = extractCoverFromMp4(ilst.data.slice(8))
        }
      }
    }
  }

  if (!imageData) return null

  try {
    const blob = new Blob([imageData as BlobPart])
    cacheArtwork(path, blob).catch(() => {})
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
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

  // Try native MediaStore query first (works on Android 11+)
  try {
    const { nativeScanLocalMusic } = await import('./nativePlugin')
    const nativeTracks = await nativeScanLocalMusic()
    if (nativeTracks.length > 0) {
      return nativeTracks
        .filter(t => t.path && isAudioFile(t.path))
        .map(t => ({
          name: t.title || t.path.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Unknown',
          path: t.path,
          uri: Capacitor.convertFileSrc(t.path),
          size: t.size,
          mtime: t.mtime,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }
  } catch {
    // Fall through to filesystem scan
  }

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

  if (Capacitor.isNativePlatform() && all.length > 0) {
    const results = await Promise.allSettled(all.map(t => extractEmbeddedArtwork(t.path)))
    for (let i = 0; i < all.length; i++) {
      const r = results[i]
      if (r && r.status === 'fulfilled' && r.value) {
        all[i]!.artworkUrl = r.value
      }
    }
  }

  return all
}

export function isAudioFile(name: string): boolean {
  const ext = name.substring(name.lastIndexOf('.')).toLowerCase()
  return AUDIO_EXTENSIONS.has(ext)
}
