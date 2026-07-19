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

const pendingDedup = new Map<string, Promise<unknown>>()

export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = TTL,
): Promise<T> {
  const existing = memoryCache.get(key)
  if (existing && Date.now() - existing.ts < ttl) {
    return existing.data as T
  }

  const inflight = pendingDedup.get(key) as Promise<T> | undefined
  if (inflight) return inflight

  const netPromise = fetcher()
  pendingDedup.set(key, netPromise.finally(() => pendingDedup.delete(key)))

  const [dbCached] = await Promise.all([getCachedMetadata<T>(key), netPromise])
  if (dbCached !== null) {
    memoryCache.set(key, { data: dbCached, ts: Date.now() })
    netPromise.then(data => cacheMetadata(key, data).catch(() => {}))
    return dbCached
  }

  const data = await netPromise
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
