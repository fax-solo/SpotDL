const VERSION = 'spotdl-v3'
const CACHE = VERSION
const API_CACHE = 'spotdl-api-v3'
const IMAGE_CACHE = 'spotdl-images-v3'
const FONT_CACHE = 'spotdl-fonts-v3'

const STATIC = ['/', '/manifest.json', '/favicon.svg', '/favicon.png']

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
  't.scdn.co',
  'wrapped-images.spotifycdn.com',
  'charts-images.scdn.co',
  'dailyplaylists-images.scdn.co',
  'concerts-images.scdn.co',
  'lineup-images.scdn.co',
  'video-files.scdn.co',
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
        Promise.all(keys.filter((k) => k !== CACHE && k !== API_CACHE && k !== IMAGE_CACHE && k !== FONT_CACHE).map((k) => caches.delete(k)))
      ),
    ])
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return

  // API functions: stale-while-revalidate
  if (url.pathname.includes('/api/')) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE))
    return
  }

  // Images: cache-first with background refresh
  if (IMAGE_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE))
    return
  }

  // Fonts: cache-first
  if (url.pathname.startsWith('/fonts/')) {
    event.respondWith(cacheFirst(request, FONT_CACHE))
    return
  }

  // Same-origin: network-first with cache fallback
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, CACHE))
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

// Periodic cleanup: keep max 500 entries per cache, delete entries older than 24h
async function trimCache(cacheName, maxEntries = 500) {
  const cache = await caches.open(cacheName)
  const requests = await cache.keys()
  if (requests.length <= maxEntries) return

  const entries = await Promise.all(
    requests.map(async (req) => {
      const resp = await cache.match(req)
      const date = resp ? new Date(resp.headers.get('date') || 0).getTime() : 0
      return { req, date }
    })
  )
  entries.sort((a, b) => b.date - a.date)
  for (let i = maxEntries; i < entries.length; i++) {
    cache.delete(entries[i].req)
  }
}

self.addEventListener('message', (event) => {
  if (event.data === 'trim-caches') {
    trimCache(API_CACHE).catch(() => {})
    trimCache(IMAGE_CACHE).catch(() => {})
  }
})
