const CACHE = 'umpire-pwa-v2';
const SHELL = [
  '/umpire',
  '/umpire.html',
  '/umpire.webmanifest',
  '/umpire-icons/icon-192.png',
  '/umpire-icons/icon-512.png',
];

function precacheShell(cache, urls) {
  return Promise.all(urls.map((url) => cache.add(url).catch(() => undefined)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => precacheShell(cache, SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request)).then((response) => response || caches.match('/umpire')),
  );
});
