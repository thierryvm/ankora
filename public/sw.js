/* Ankora — minimal service worker.
 *
 * Scope: offline shell only. NEVER caches authenticated API responses, auth tokens,
 * or anything under /app or /auth — those must always hit the network to guarantee
 * RLS and session freshness.
 */

// Bumped 2026-07-25 (THI-324 follow-up) to purge caches holding RSC payloads
// and the pre-cached `/` document. Measured before the fix: after a plain visit
// plus one locale switch, Cache Storage held 8 `?_rsc=` entries — including
// English ones (`/en?_rsc=…`) — plus the `/` document. Those payloads were
// served cache-first FOREVER (no network failure needed), which meant the
// locale silently reverted to a cached English render and `updateSession`
// (proxy → Supabase refresh) never ran, so the session went stale and the app
// asked to log in again. Reported by @thierry 2026-07-25, both symptoms, one
// cause. The `activate` handler deletes any cache whose key doesn't start with
// the current `CACHE_VERSION`, so bumping is the canonical clean slate.
// (2026-06-02 purged locale-blind authenticated pages; 2026-05-19 the
// /fonts/*.ttf HTML-404 poison.)
// Bumped 2026-08-05 : le `skipWaiting()` inconditionnel disparaît de `install`
// (cf. plus bas). Incrémenter la version est l'ardoise propre canonique — le
// gestionnaire `activate` supprime tout cache dont la clé ne commence pas par
// la version courante.
const CACHE_VERSION = 'ankora-v5-20260805';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const OFFLINE_URL = '/offline';

// Immutable, non-negotiated assets only. `/` is deliberately NOT here: it is a
// locale-negotiated document (next-intl `as-needed` serves FR at `/` and EN at
// `/en`, chosen from the cookie/Accept-Language), so a single cached copy is
// wrong for anyone whose locale differs from whoever's install populated it.
const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/icon.svg',
  '/apple-icon.svg',
  '/brand/logo.svg',
  OFFLINE_URL,
];

/**
 * Pre-cache the offline document WITHOUT the redirect flag.
 *
 * `/offline` is locale-negotiated (`as-needed`), so for a visitor whose locale
 * is `en` the fetch follows `/offline` → 307 → `/en/offline` and the stored
 * Response carries `redirected === true`. Handing a redirected Response back
 * from `respondWith()` on a **navigate** request throws a TypeError in Chrome
 * and WebKit — the offline fallback would fail exactly when it is needed.
 * Rebuilding it from its body clears the flag.
 */
async function precacheOffline(cache) {
  const res = await fetch(OFFLINE_URL, { credentials: 'same-origin' });
  if (!res.ok) return;
  const clean = new Response(await res.blob(), {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
  await cache.put(OFFLINE_URL, clean);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then(async (cache) => {
        // Assets are independent: one 404 must not abort the whole precache.
        await cache.addAll(PRECACHE_URLS.filter((u) => u !== OFFLINE_URL)).catch(() => undefined);
        await precacheOffline(cache).catch(() => undefined);
      })
      // PAS de `self.skipWaiting()` ici, et c'est le cœur du correctif du
      // 2026-08-05. Un worker qui s'active tout seul ne passe jamais par l'état
      // `waiting` — donc l'application n'a rien à détecter, donc rien à annoncer
      // à l'utilisateur. Dans une PWA `standalone`, où iOS supprime la barre
      // d'adresse et le tirer-pour-rafraîchir, cela revenait à ne jamais pouvoir
      // livrer une mise à jour. Le worker attend désormais qu'on la lui demande.
      .then(() => undefined),
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

/**
 * Activation à la demande.
 *
 * Le seul émetteur légitime est `appliquerMiseAJour()` côté client, appelé par
 * un clic sur « Recharger ». Le rechargement qui suit est armé du même côté :
 * `clients.claim()` déclenche aussi `controllerchange` à la toute première
 * installation, et recharger là ferait sauter la page d'un visiteur qui n'a
 * rien demandé.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
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

/**
 * ALLOWLIST — the only things this worker is allowed to cache.
 *
 * Deliberately an allowlist, not a denylist. The previous design cached
 * "everything except a blocklist", so every new dynamic GET route silently
 * re-opened the hole: that is what produced THI-324 (authenticated locale-
 * prefixed pages), the /fonts/*.ttf HTML-404 poison, and the RSC/locale bug of
 * 2026-07-25. Entries here are content-hashed or genuinely static — never
 * negotiated by cookie, locale, or session.
 */
const CACHEABLE_ASSET =
  /^\/(?:_next\/static\/|icons\/|brand\/|fonts\/)|^\/(?:manifest\.webmanifest|icon\.svg|apple-icon\.svg|favicon\.ico)$|\.(?:png|jpe?g|svg|webp|avif|ico|woff2?|ttf|otf)$/;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations: always the network, so next-intl negotiates the locale and
  // the proxy refreshes the Supabase session. `/offline` is the ONLY fallback —
  // never a cached copy of the page itself, which would resurrect a stale locale
  // or a stale auth state (the 2026-07-25 bug).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  // Everything that is not an immutable asset — RSC payloads (`?_rsc=`,
  // `Accept: text/x-component`), API calls, documents — is left entirely alone:
  // no respondWith, so the browser performs a normal network request and its
  // Set-Cookie / session refresh happen exactly as the server intended.
  if (!CACHEABLE_ASSET.test(url.pathname) || isBypass(url)) return;

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
