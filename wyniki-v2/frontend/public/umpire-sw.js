const CACHE = 'umpire-pwa-v4';
const SHELL = [
  '/umpire',
  '/umpire.html',
  '/umpire.webmanifest',
  '/umpire-icons/icon-192.png',
  '/umpire-icons/icon-512.png',
];
const PRECACHE_ASSETS = [];

function assetUrlsFromHtml(html) {
  const urls = [];
  for (const match of String(html || '').matchAll(/(?:src|href)=["'](\/?assets\/[^"']+)["']/g)) {
    const url = match[1].startsWith('/') ? match[1] : `/${match[1]}`;
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

function precacheUrls(cache, urls) {
  return Promise.all(urls.map((url) => cache.add(url).catch(() => undefined)));
}

async function collectPrecacheUrls() {
  const urls = new Set([...SHELL, ...PRECACHE_ASSETS]);
  try {
    const response = await fetch('/umpire.html', { cache: 'no-store' });
    if (response.ok) {
      for (const url of assetUrlsFromHtml(await response.text())) urls.add(url);
    }
  } catch {
    /* install still uses SHELL + build-time PRECACHE_ASSETS */
  }
  return [...urls];
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    });
  });
}

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => caches.match(request).then((cached) => cached || caches.match('/umpire')));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(async (cache) => {
        await precacheUrls(cache, await collectPrecacheUrls());
      })
      .then(() => self.skipWaiting()),
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
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }
  event.respondWith(networkFirst(event.request));
});
