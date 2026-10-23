/* eslint-env serviceworker */
// The web build's service worker, after super-chat's. The build
// (pwa/vite-plugin.ts) fills in VERSION and PRECACHE, so every build is a new
// worker: it installs in the background and takes over when the page asks
// (index.web.tsx does once the app is hidden), or straight away if no window
// is open.
//
// Only the app's own files are cached. The lock API always goes to the
// network: a cached door state would be a lie.
//
// The page is cached as "/", never "/index.html": Go's file server redirects
// the latter to "/", and a browser refuses a redirected response for a page
// load. For the same reason nothing redirected is ever stored.
const VERSION = self.__VERSION__
const PRECACHE = self.__PRECACHE__
const CACHE = `open-lock-${VERSION}`
const SHELL = '/'

async function clean(res) {
  if (!res.redirected) return res
  return new Response(await res.blob(), {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  })
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      for (const url of PRECACHE) {
        const res = await fetch(new Request(url, { cache: 'reload' }))
        if (!res.ok) throw new Error(`precache ${url}: ${res.status}`)
        await cache.put(url, await clean(res))
      }
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (!open.length) await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('open-lock-') && key !== CACHE) await caches.delete(key)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

// The web-controller's own routes, when the app shares its origin.
const PASS = /^\/(state|battery|open|close|healthz|ws)$/

async function fromCache(key) {
  try {
    const hit = await caches.match(key, { cacheName: CACHE })
    return hit && !hit.redirected ? hit : null
  } catch {
    return null
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || PASS.test(url.pathname)) return
  const key = req.mode === 'navigate' ? SHELL : req
  event.respondWith(fromCache(key).then((hit) => hit || fetch(req)))
})
