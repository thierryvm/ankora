/* Ankora — minimal service worker.
 *
 * Scope: offline shell only. NEVER caches authenticated API responses, auth tokens,
 * or anything under /app or /auth — those must always hit the network to guarantee
 * RLS and session freshness.
 */

// Bumped 2026-05-19 (PR P0-V2) to purge caches poisoned with the HTML 404 that
// /fonts/*.ttf used to return before PR #169 fixed the middleware matcher. The
// `activate` handler below deletes any cache whose key doesn't start with the
// current `CACHE_VERSION`, so bumping this constant is the canonical way to
// force a clean slate across all returning visitors on first SW activation.
const CACHE_VERSION = 'ankora-v2-20260519';
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
    url.pathname.startsWith('/onboarding') ||
    // Self-hosted variable fonts. The browser HTTP cache + Vercel
    // Cache-Control already handle them efficiently; routing them through the
    // SW cache risked serving a stale HTML 404 from before PR #169 (when the
    // middleware matcher didn't exclude .ttf), which the browser then tried to
    // parse as a font and rejected with `OTS parsing error: invalid
    // sfntVersion: 168430090 (0x0A0A0A0A = '\n\n\n\n')`. Bypassing the SW
    // here makes that whole class of cache-poisoning bugs impossible.
    url.pathname.startsWith('/fonts/')
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
