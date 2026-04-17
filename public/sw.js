// Minimal service worker — skip install/activate quickly, let the browser
// handle all fetching natively.  The old SW intercepted every fetch with
// `e.respondWith(fetch(e.request))` which added latency and could serve stale
// responses on iOS where SW updates are delayed.  A no-op fetch handler is
// better: the browser's own HTTP cache + Vite hashed filenames handle caching.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
// Intentionally no fetch handler — let the browser do its thing.
