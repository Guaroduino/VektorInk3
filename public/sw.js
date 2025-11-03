// Lightweight service worker for VektorInk3
const CACHE = 'vi-cache-v1'
const OFFLINE_FALLBACK = self.registration.scope || '/' // not used but kept for future

self.addEventListener('install', (event) => {
  // Skip waiting so updates take effect immediately
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // Ignore non-GET, dev HMR and cross-origin
  if (req.method !== 'GET' || !url.origin || url.origin !== self.location.origin) return
  if (url.pathname.includes('@react-refresh') || url.pathname.includes('sockjs-node') || url.pathname.includes('vite')) return

  // Navigation requests: network-first fallback to cache
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(req)
          const cache = await caches.open(CACHE)
          cache.put(req, net.clone())
          return net
        } catch (err) {
          const cache = await caches.open(CACHE)
          const cached = await cache.match(req)
          return cached || fetch(req)
        }
      })()
    )
    return
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const cached = await cache.match(req)
      const fetchPromise = fetch(req)
        .then((res) => {
          cache.put(req, res.clone())
          return res
        })
        .catch(() => cached)
      return cached || fetchPromise
    })()
  )
})
