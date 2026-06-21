import { Capacitor } from '@capacitor/core'
import { cacheBlob, getCachedBlob } from './dbCache'

const memoryCache = new Map<string, { blob: Blob; url: string; ts: number }>()
const MEMORY_TTL = 5 * 60 * 1000
const MEMORY_MAX = 50

const BLOB_PREFIX = 'blob://'

export function isBlobPath(filePath: string): boolean {
  return filePath.startsWith(BLOB_PREFIX)
}

export function getBlobId(filePath: string): string {
  return filePath.slice(BLOB_PREFIX.length)
}

function evictMemory() {
  if (memoryCache.size <= MEMORY_MAX) return
  const entries = [...memoryCache.entries()].sort((a, b) => a[1].ts - b[1].ts)
  const toRemove = entries.slice(0, entries.length - MEMORY_MAX)
  for (const [key] of toRemove) {
    const entry = memoryCache.get(key)
    if (entry) URL.revokeObjectURL(entry.url)
    memoryCache.delete(key)
  }
}

export async function storeBlob(filename: string, blob: Blob): Promise<string> {
  const existing = memoryCache.get(filename)
  if (existing) URL.revokeObjectURL(existing.url)
  const url = URL.createObjectURL(blob)
  memoryCache.set(filename, { blob, url, ts: Date.now() })
  evictMemory()

  cacheBlob(filename, blob).catch(() => {})

  return BLOB_PREFIX + filename
}

export function getBlobUrl(filePath: string): string | null {
  if (!isBlobPath(filePath)) return null
  const id = getBlobId(filePath)
  const entry = memoryCache.get(id)
  if (entry && Date.now() - entry.ts < MEMORY_TTL) return entry.url
  if (entry) {
    URL.revokeObjectURL(entry.url)
    memoryCache.delete(id)
  }
  return null
}

export async function getBlobFromCache(filePath: string): Promise<Blob | null> {
  if (!isBlobPath(filePath)) return null
  const id = getBlobId(filePath)
  const memory = memoryCache.get(id)
  if (memory && Date.now() - memory.ts < MEMORY_TTL) return memory.blob
  return getCachedBlob(id)
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
