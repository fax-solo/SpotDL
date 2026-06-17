import { Capacitor } from '@capacitor/core'

const cache = new Map<string, { blob: Blob; url: string }>()

const BLOB_PREFIX = 'blob://'

export function isBlobPath(filePath: string): boolean {
  return filePath.startsWith(BLOB_PREFIX)
}

export function getBlobId(filePath: string): string {
  return filePath.slice(BLOB_PREFIX.length)
}

export function storeBlob(filename: string, blob: Blob): string {
  const existing = cache.get(filename)
  if (existing) URL.revokeObjectURL(existing.url)
  const url = URL.createObjectURL(blob)
  cache.set(filename, { blob, url })
  return BLOB_PREFIX + filename
}

export function getBlobUrl(filePath: string): string | null {
  if (!isBlobPath(filePath)) return null
  const id = getBlobId(filePath)
  return cache.get(id)?.url ?? null
}

export function getAudioSrcFromFileOrCache(filePath: string): string | null {
  const blobUrl = getBlobUrl(filePath)
  if (blobUrl) return blobUrl
  if (!Capacitor.isNativePlatform()) return null
  try {
    return Capacitor.convertFileSrc(filePath)
  } catch {
    return null
  }
}
