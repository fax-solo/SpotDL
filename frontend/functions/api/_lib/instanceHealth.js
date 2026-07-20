import { scrapeLog } from './log.js'

const HEALTH_CACHE_TTL = 120000
let _healthCache = { timestamp: 0, healthy: [] }

export async function filterHealthyInstances(instances, path = '/', timeout = 4000) {
  const now = Date.now()
  if (now - _healthCache.timestamp < HEALTH_CACHE_TTL && _healthCache.healthy.length > 0) {
    return _healthCache.healthy
  }

  const results = await Promise.allSettled(
    instances.map(async (base) => {
      try {
        const url = `${base}${path}`
        const res = await fetch(url, { signal: AbortSignal.timeout(timeout) })
        if (res.ok) return base
      } catch {}
      return null
    })
  )

  const healthy = []
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) healthy.push(r.value)
  }

  if (healthy.length > 0) {
    _healthCache = { timestamp: now, healthy }
  }

  if (healthy.length === 0) {
    scrapeLog('instanceHealth', 'all_instances_down', { count: instances.length })
    return instances.slice(0, 3)
  }

  return healthy
}

export function clearHealthCache() {
  _healthCache = { timestamp: 0, healthy: [] }
}
