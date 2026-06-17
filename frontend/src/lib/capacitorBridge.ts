import { Capacitor } from '@capacitor/core'
import { getBlobUrl, isBlobPath, storeBlob } from './blobCache'

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * Saves a blob to disk.
 * On Android: writes to the Documents directory and returns the file:// URI.
 * On web: triggers a browser download and returns null.
 */
export async function downloadFile(blob: Blob, filename: string): Promise<string | null> {
  if (isNative()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const base64 = await blobToBase64(blob)
      const result = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Documents,
        recursive: true,
      })
      return result.uri
    } catch (err) {
      console.error('[capacitorBridge] Failed to write file to disk:', err)
      return null
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return null
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Converts a stored file path / URI into a URL the <audio> element can play.
 * Checks the in-memory blob cache first, then falls back to native filesystem path.
 * On Android: uses Capacitor.convertFileSrc() to rewrite file:// → http://localhost/...
 * On web: only works if blob was cached in memory.
 */
export function getAudioSrc(filePath: string): string | null {
  const blobUrl = getBlobUrl(filePath)
  if (blobUrl) return blobUrl
  if (!isNative()) return null
  try {
    return Capacitor.convertFileSrc(filePath)
  } catch {
    return null
  }
}

/**
 * Checks whether a file still exists at the given path on native.
 * Returns true if the file exists (or we can't determine — optimistically assume it does).
 */
export async function fileExists(filePath: string): Promise<boolean> {
  if (isBlobPath(filePath)) return !!getBlobUrl(filePath)
  if (!isNative()) return false
  try {
    const { Filesystem } = await import('@capacitor/filesystem')
    await Filesystem.stat({ path: filePath })
    return true
  } catch {
    return false
  }
}

/** @deprecated Use getAudioSrc instead — avoid reading the whole MP3 into memory */
export async function readAudioFile(path: string): Promise<string | null> {
  return getAudioSrc(path)
}

export async function saveOrCacheBlob(blob: Blob, filename: string): Promise<string | null> {
  let path = await downloadFile(blob, filename)
  if (!path) {
    path = storeBlob(filename, blob)
  }
  return path
}
