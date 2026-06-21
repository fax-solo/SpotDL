const VERSION = 'spotdl-v2'
const CACHE = VERSION
const API_CACHE = 'spotdl-api-v2'
const IMAGE_CACHE = 'spotdl-images-v2'

const STATIC = ['/']

const IMAGE_HOSTS = new Set([
  'i.scdn.co',
  'i.ytimg.com',
  'image-cdn-ak.spotifycdn.com',
  'image-cdn-fa.spotifycdn.com',
  'mosaic.scdn.co',
  'seed-mix-image.spotifycdn.com',
  'thisis-images.scdn.co',
  'dailymix-images.scdn.co',
  'newjams-images.scdn.co',
])

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      // Clean old caches
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== API_CACHE && k !== IMAGE_CACHE).map((k) => caches.delete(k)))
      ),
    ])
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return

  // API functions: stale-while-revalidate
  if (url.pathname.includes('/.netlify/functions/') || url.pathname.includes('/api/')) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE))
    return
  }

  // Images: cache-first with background refresh
  if (IMAGE_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE))
    return
  }

  // Same-origin: network-first with cache fallback
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, CACHE))
    return
  }

  // Fonts: cache-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, CACHE))
    return
  }
})

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    return cache.match(request) || new Response('Offline', { status: 503 })
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    cache.put(request, response.clone())
  }
  return response
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone())
    return response
  }).catch(() => cached)

  return cached || fetchPromise
}

// Periodic cleanup: delete old API/image cache entries (runs hourly)
setInterval(async () => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  for (const cacheName of [API_CACHE, IMAGE_CACHE]) {
    const cache = await caches.open(cacheName)
    const requests = await cache.keys()
    for (const req of requests) {
      const resp = await cache.match(req)
      if (resp) {
        const date = resp.headers.get('date')
        if (date && new Date(date).getTime() < cutoff) {
          cache.delete(req)
        }
      }
    }
  }
}, 60 * 60 * 1000)
