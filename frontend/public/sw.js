const CACHE = 'spotdl-v1'
const API_CACHE = 'spotdl-api-v1'
const IMAGE_CACHE = 'spotdl-images-v1'

const STATIC = [
  '/',
]

const IMAGE_HOSTS = [
  'i.scdn.co',
  'i.ytimg.com',
  'image-cdn-ak.spotifycdn.com',
  'image-cdn-fa.spotifycdn.com',
  'mosaic.scdn.co',
  'seed-mix-image.spotifycdn.com',
  'thisis-images.scdn.co',
  'dailymix-images.scdn.co',
  'newjams-images.scdn.co',
]

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC)),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return

  if (url.pathname.includes('/.netlify/functions/')) {
    event.respondWith(networkFirst(request, API_CACHE))
    return
  }

  if (IMAGE_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE))
    return
  }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, CACHE))
    return
  }

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
