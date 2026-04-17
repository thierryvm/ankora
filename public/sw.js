/* Ankora — minimal service worker.
 *
 * Scope: offline shell only. NEVER caches authenticated API responses, auth tokens,
 * or anything under /app or /auth — those must always hit the network to guarantee
 * RLS and session freshness.
 */

const CACHE_VERSION = 'ankora-v1-20260417';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/apple-icon.svg',
  '/brand/logo.svg',
  '/offline',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isBypass(url) {
  return (
    url.pathname.startsWith('/app') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/_next/data') ||
    url.pathname.startsWith('/onboarding')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isBypass(url)) return;

  // Network-first for HTML, cache-first for static assets.
  const accept = request.headers.get('accept') ?? '';
  if (accept.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match('/offline'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        }),
    ),
  );
});
