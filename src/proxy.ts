import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import createMiddleware from 'next-intl/middleware';

import { routing } from '@/i18n/routing';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Execution order:
 *   1. Per-request CSP + nonce + x-pathname — injected onto the REQUEST headers
 *      BEFORE i18n routing runs. Next-intl's `handleI18nRouting` captures a
 *      snapshot of the request headers at invocation time when it builds the
 *      response; any header mutation AFTER it is invisible to downstream Server
 *      Components calling `headers()`. Before 2026-05-18 this step ran AFTER
 *      i18n routing — Server Components saw `getNonce() === undefined`, so the
 *      theme-boot inline script in `[locale]/layout.tsx` rendered without a
 *      `nonce` attribute and was blocked by the strict CSP. Cf.
 *      `docs/audits/2026-05-18-prod-p0-bugs-diagnostic.md`.
 *   2. next-intl `handleI18nRouting` — detects the locale (URL segment > cookie > default),
 *      performs any 302 redirect / internal rewrite and sets the NEXT_LOCALE cookie on the
 *      outgoing response.
 *   3. Apply CSP header to the outgoing response so the browser receives the
 *      matching policy for the nonce that Server Components rendered with.
 *   4. Supabase `updateSession` — refreshes the session cookie on the already-localized
 *      response, otherwise a `redirect()` issued by an auth-protected layout would lose the
 *      locale prefix.
 */

const handleI18nRouting = createMiddleware(routing);

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const supabaseDomains = 'https://*.supabase.co wss://*.supabase.co';
  const vercelInsights = 'https://vitals.vercel-insights.com';

  // React 19 + Turbopack need loosened script/style policies in dev for HMR and
  // stack-trace reconstruction. Production stays strict (nonce + strict-dynamic only).
  const devScriptExtras = isDev ? ` 'unsafe-${'eval'}' 'unsafe-inline'` : '';
  const devStyleExtras = isDev ? ` 'unsafe-inline'` : '';

  // PR-D5 mobile-iOS: only emit `upgrade-insecure-requests` when the app is
  // actually served over HTTPS. WebKit-based engines (Playwright iPhone 14
  // emulation + real iOS Safari) honour this directive strictly even on
  // localhost, which causes the relative-URL stylesheet to be fetched at
  // `https://localhost:3000` instead of `http://`. The HTTPS request fails
  // against `npm run start` (HTTP-only), every Tailwind utility is dropped,
  // inputs fall back to WebKit's 13px form-control default, and the
  // anti-auto-zoom invariant cannot be measured. Chromium has an implicit
  // exception for `localhost`; WebKit does not. Gate the directive on the
  // canonical app URL so prod (HTTPS) keeps the protection and local prod
  // builds (HTTP) drop it. Cf. docs/audits/2026-05-16-pr-d5-mobile-ios.md.
  const appUrlIsHttps = process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://') ?? false;

  const directives: Record<string, string> = {
    'default-src': `'self'`,
    'script-src': `'self' 'nonce-${nonce}' 'strict-dynamic'${devScriptExtras}`,
    'style-src': `'self' 'nonce-${nonce}'${devStyleExtras}`,
    'img-src': `'self' data: blob: ${supabaseDomains}`,
    'font-src': `'self' data:`,
    'connect-src': `'self' ${supabaseDomains} ${vercelInsights}${isDev ? ' ws: wss:' : ''}`,
    'frame-src': `'self'`,
    'frame-ancestors': `'none'`,
    'form-action': `'self'`,
    'base-uri': `'self'`,
    'object-src': `'none'`,
    'manifest-src': `'self'`,
    'worker-src': `'self' blob:`,
    ...(appUrlIsHttps ? { 'upgrade-insecure-requests': '' } : {}),
  };

  return Object.entries(directives)
    .map(([key, value]) => (value ? `${key} ${value}` : key))
    .join('; ');
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // 1. Generate CSP nonce and write it onto the REQUEST headers BEFORE i18n
  //    routing. Server Components read it via `headers().get('x-nonce')`. The
  //    `x-pathname` companion is required by `require-admin.ts` audit logging
  //    (cf. PR-SEC-ADMIN security-auditor P1-A: without it every
  //    admin.access.* event records `path: '/admin'` regardless of sub-route).
  //    These mutations MUST happen before `handleI18nRouting` because next-intl
  //    snapshots `request.headers` when it constructs the response — later
  //    mutations are invisible to downstream Server Components.
  const nonce = Buffer.from(nanoid()).toString('base64');
  const csp = buildCsp(nonce);
  request.headers.set('x-nonce', nonce);
  request.headers.set('content-security-policy', csp);
  request.headers.set('x-pathname', request.nextUrl.pathname);

  // 2. i18n routing. Produces either a redirect, an internal rewrite, or a
  //    NextResponse.next() carrying the NEXT_LOCALE cookie. Subsequent steps
  //    augment this response in-place.
  const response = handleI18nRouting(request);

  // 3. Apply CSP to the outgoing response so the browser enforces the same
  //    nonce the Server Components rendered with.
  response.headers.set('content-security-policy', csp);

  // 4. Supabase session refresh on the locale-aware response (mutates its cookies).
  return updateSession(request, response);
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - API routes
     * - OAuth callback (never localized, must keep the exact /auth/callback path)
     * - Monitoring endpoints
     * - Next internals and image optimization
     * - Public brand assets and PWA manifest
     * - Static font files served from /public/fonts/ (ttf, woff, woff2, otf, eot).
     *   Without this exclusion next-intl treats /fonts/Inter-Variable.ttf as a
     *   localizable page path and routes it to /_not-found (404). Symptom
     *   observed in prod on 2026-05-18: globals.css @font-face fallbacks
     *   failed to load. Cf. docs/audits/2026-05-18-prod-p0-bugs-diagnostic.md.
     * - `/sw.js` ServiceWorker entry point. Without this exclusion next-intl
     *   routes /sw.js to /_not-found (HTTP 404) and
     *   `navigator.serviceWorker.register('/sw.js')` in
     *   `ServiceWorkerRegister.tsx` silently fails. Worse, users who installed
     *   the SW before this fix have a cached SW that the browser can never
     *   UPDATE (the `update` request also 404s) — they stay on the old SW
     *   indefinitely, which is the actual root cause of the iPhone Safari +
     *   PWA "OTS parsing error: invalid sfntVersion: 168430090" font bug.
     *   Cf. docs/audits/2026-05-19-prod-p0-v2-bugs-diagnostic.md.
     *
     * Note on RSC prefetches: previously excluded via `missing:` to avoid
     * caching a fresh CSP nonce across users. That was over-cautious — RSC
     * responses already carry `Cache-Control: private, no-store`, so Vercel
     * edge does not cache them. Excluding prefetches caused 404s on every
     * `<Link prefetch>` because next-intl could not rewrite `/` → `/fr-BE`.
     * The middleware now runs on prefetches too; each prefetch gets its own
     * per-request nonce that is never shared with another user.
     */
    '/((?!api|auth/callback|monitoring|_next/static|_next/image|_vercel|favicon.ico|icon.svg|apple-icon.svg|manifest.webmanifest|sw\\.js|robots.txt|sitemap.xml|llms\\.txt|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|ttf|woff|woff2|otf|eot)).*)',
  ],
};
