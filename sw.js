// Only the static app shell is cached. No YouTube data, local photos, or API key.
const CACHE = 'yt-mosaic-shell-v1';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const allowedUrls = new Set(ASSETS.map(asset => new URL(asset, self.registration.scope).href));
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !allowedUrls.has(request.url)) return;
  event.respondWith(fetch(request, { cache: 'no-store' }).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  }).catch(async () => (await caches.match(request)) || Response.error()));
});
