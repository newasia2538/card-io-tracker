const STATIC_CACHE = 'card-ledger-static-v1'
const APP_SHELL_URLS = ['/', '/manifest.webmanifest', '/icon.svg']
const STATIC_DESTINATIONS = new Set([
  'document',
  'script',
  'style',
  'image',
  'font',
  'manifest',
])

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((cacheName) => cacheName !== STATIC_CACHE)
        .map((cacheName) => caches.delete(cacheName)),
    )),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (!shouldHandleRequest(request)) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request))
    return
  }

  event.respondWith(handleStaticAsset(request))
})

function shouldHandleRequest(request) {
  if (request.method !== 'GET') {
    return false
  }

  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
    return false
  }

  const url = new URL(request.url)

  if (url.origin !== self.location.origin) {
    return false
  }

  if (url.pathname.startsWith('/api/')) {
    return false
  }

  if (url.pathname === '/sw.js') {
    return false
  }

  return (
    request.mode === 'navigate' ||
    STATIC_DESTINATIONS.has(request.destination) ||
    isStaticAssetPath(url.pathname)
  )
}

async function handleNavigation(request) {
  const cache = await caches.open(STATIC_CACHE)

  try {
    const response = await fetch(request)
    if (response.ok) {
      await cache.put(request, response.clone())
    }
    return response
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match('/')) ||
      Response.error()
    )
  }
}

async function handleStaticAsset(request) {
  const cache = await caches.open(STATIC_CACHE)
  const cachedResponse = await cache.match(request)

  if (cachedResponse) {
    return cachedResponse
  }

  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
  }
  return response
}

function isStaticAssetPath(pathname) {
  return /\.(?:css|gif|ico|jpe?g|js|mjs|png|svg|webmanifest|webp|woff2?)$/i.test(pathname)
}
