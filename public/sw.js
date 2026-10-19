const CACHE_NAME = 'aquatrak-cache-v3';
const STATIC_ASSET_PREFIX = '/assets/';
const PRECACHE_URLS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable.png',
  '/favicon-32.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

function isCacheable(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.hostname.endsWith('supabase.co')) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (!isCacheable(url)) return; // pass through untouched

  // Hashed build assets are immutable -> cache-first
  if (url.pathname.startsWith(STATIC_ASSET_PREFIX)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Navigations / HTML -> network-first so a new deploy is picked up at once
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put('/index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || Response.error()))
    );
    return;
  }

  // Other same-origin GETs (manifest, icons) -> network, cached as backup
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || Response.error()))
  );
});
