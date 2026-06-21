import { cacheMetadata, getCachedMetadata } from './dbCache'

interface CacheEntry {
  data: unknown
  ts: number
}

const memoryCache = new Map<string, CacheEntry>()
const TTL = 5 * 60 * 1000
const MAX_ENTRIES = 200

function evictIfNeeded() {
  if (memoryCache.size <= MAX_ENTRIES) return
  const entries = [...memoryCache.entries()]
    .filter(([k]) => !k.startsWith('__dedup_'))
    .sort((a, b) => a[1].ts - b[1].ts)
  const toRemove = entries.slice(0, entries.length - MAX_ENTRIES)
  for (const [key] of toRemove) {
    memoryCache.delete(key)
  }
}

export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = TTL,
): Promise<T> {
  const existing = memoryCache.get(key)
  if (existing && Date.now() - existing.ts < ttl) {
    return existing.data as T
  }

  const dbCached = await getCachedMetadata<T>(key)
  if (dbCached !== null) {
    memoryCache.set(key, { data: dbCached, ts: Date.now() })
    return dbCached
  }

  const dedupKey = `__dedup_${key}`
  const inflight = (memoryCache.get(dedupKey)?.data as Promise<T> | undefined)
  if (inflight) return inflight

  const promise = fetcher().finally(() => memoryCache.delete(dedupKey))
  memoryCache.set(dedupKey, { data: promise, ts: Date.now() })

  const data = await promise
  memoryCache.set(key, { data, ts: Date.now() })
  cacheMetadata(key, data).catch(() => {})
  evictIfNeeded()
  return data
}

export function invalidateCache(pattern?: RegExp) {
  if (!pattern) {
    memoryCache.clear()
    return
  }
  for (const key of memoryCache.keys()) {
    if (pattern.test(key)) memoryCache.delete(key)
  }
}
