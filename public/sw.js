/* Ankora — minimal service worker.
 *
 * Scope: offline shell only. NEVER caches authenticated API responses, auth tokens,
 * or anything under /app or /auth — those must always hit the network to guarantee
 * RLS and session freshness.
 */

// Bumped 2026-06-02 (THI-324) to purge caches poisoned with authenticated,
// locale-prefixed pages (`/en/app/*`, `/admin`, `/login`, …) that the old
// locale-blind `isBypass` let through — see the `isBypass` note below. The
// `activate` handler deletes any cache whose key doesn't start with the current
// `CACHE_VERSION`, so bumping this constant is the canonical way to force a
// clean slate across all returning visitors on first SW activation.
// (Previous bump 2026-05-19 / PR P0-V2 purged the /fonts/*.ttf HTML-404 poison.)
const CACHE_VERSION = 'ankora-v3-20260602';
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

// Authenticated / credential-bearing page surfaces, matched WITH OR WITHOUT a
// leading next-intl locale segment (`en`, `fr-BE`, `nl-BE`, `de-DE`, `es-ES`).
//
// THI-324: the previous `startsWith('/app')` was locale-BLIND. The default
// locale (`fr-BE`) is unprefixed, so `/app` matched — but `/en/app`, `/nl-BE/app`
// etc. did NOT, slipped past the bypass, and got network-first-CACHED, poisoning
// authenticated non-default-locale pages (the FR→EN revert on navigation). The
// same blind spot left `/admin` (requireAdmin) and the `(auth)` group pages
// (`/login`, `/signup`, `/forgot-password`, `/reset-password`) cacheable too —
// a pre-existing leak this regex also closes.
//
// Slugs are the REAL resolved paths: the `(auth)` route group adds no URL
// segment, so the auth pages are `/login` … not `/auth/*`. The only `/auth/*`
// path is the non-localized OAuth callback (`src/app/auth/callback`), kept via a
// plain `startsWith('/auth')` below. Over-bypassing (network-first) is the SAFE
// direction; under-bypassing (caching auth) is the dangerous one.
const PROTECTED_LOCALED =
  /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?(?:app|admin|onboarding|login|signup|forgot-password|reset-password)(?:\/|$)/;

function isBypass(url) {
  return (
    // Locale-prefixable authenticated page surfaces (with or without locale).
    PROTECTED_LOCALED.test(url.pathname) ||
    // Non-localized surfaces — never carry a locale prefix.
    url.pathname.startsWith('/auth') || // OAuth callback (route handler)
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/_next/data') ||
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
