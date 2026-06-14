interface CacheEntry {
  data: unknown
  ts: number
}

const cache = new Map<string, CacheEntry>()
const TTL = 5 * 60 * 1000

export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = TTL,
): Promise<T> {
  const existing = cache.get(key)
  if (existing && Date.now() - existing.ts < ttl) {
    return existing.data as T
  }

  const dedupKey = `__dedup_${key}`
  const inflight = (cache.get(dedupKey)?.data as Promise<T> | undefined)
  if (inflight) return inflight

  const promise = fetcher().finally(() => cache.delete(dedupKey))
  cache.set(dedupKey, { data: promise, ts: Date.now() })

  const data = await promise
  cache.set(key, { data, ts: Date.now() })
  return data
}

export function invalidateCache(pattern?: RegExp) {
  if (!pattern) {
    cache.clear()
    return
  }
  for (const key of cache.keys()) {
    if (pattern.test(key)) cache.delete(key)
  }
}
