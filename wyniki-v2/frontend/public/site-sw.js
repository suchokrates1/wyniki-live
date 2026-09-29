const CACHE = 'site-pwa-v1';
// Only ever drop our own caches. The umpire PWA lives on the same origin with its
// own worker and its own `umpire-pwa-*` cache; wiping everything took its offline
// shell down whenever someone opened the public page in the same browser.
const CACHE_PREFIX = 'site-pwa-';
const SHELL = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/site-icons/icon-192.png',
  '/site-icons/icon-512.png',
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
    const response = await fetch('/', { cache: 'no-store' });
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
    .catch(() => caches.match(request).then((cached) => cached || caches.match('/')));
}

self.addEventListener('install', (event) => {
  // No skipWaiting() here on purpose: a new shell must not replace the running
  // one mid-visit. The page offers a "refresh" and sends SKIP_WAITING on a yes.
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await precacheUrls(cache, await collectPrecacheUrls());
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    /* a push with no usable body still deserves a notification */
  }
  if (payload.type && payload.type !== 'match_started') return;

  const court = payload.court_name || payload.court_id || '';
  const title = court ? `Kort ${court}` : 'blindtennis.app';
  const players = [payload.player_a, payload.player_b].filter(Boolean).join(' – ');
  event.waitUntil(self.registration.showNotification(title, {
    body: players || 'Mecz się rozpoczął',
    icon: '/site-icons/icon-192.png',
    badge: '/site-icons/icon-192.png',
    // One court, one notification: a restart must not stack a second card.
    tag: `match-${payload.court_id || 'any'}`,
    renotify: true,
    data: { url: payload.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Reuse a tab that is already on the site rather than opening another one.
    const existing = clientList.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.focus();
      if (existing.url !== target && 'navigate' in existing) await existing.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // Live/API always from network — never intercept.
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }
  event.respondWith(networkFirst(event.request));
});
