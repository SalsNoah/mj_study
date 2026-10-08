const CACHE = 'mahjong-study-v52';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['./', './index.html', './manifest.webmanifest'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  // Metadata must fail normally, never use a stale title or the HTML fallback.
  const url = new URL(request.url);
  // Standalone checker: never fall back to the study app or cache its model.
  if (url.pathname.endsWith('/ocr-check.html') ||
      (request.referrer && new URL(request.referrer).pathname.endsWith('/ocr-check.html'))) return;
  if (url.origin === 'https://www.youtube.com' && url.pathname === '/oembed') return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return caches.match('./index.html');
      }),
  );
});
