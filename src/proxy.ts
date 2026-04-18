import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import createMiddleware from 'next-intl/middleware';

import { routing } from '@/i18n/routing';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Execution order (do not swap):
 *   1. next-intl `handleI18nRouting` — detects the locale (URL segment > cookie > default),
 *      performs any 302 redirect / internal rewrite and sets the NEXT_LOCALE cookie on the
 *      outgoing response. Must run first so that downstream CSP + auth logic operates on the
 *      locale-aware response.
 *   2. Per-request CSP + nonce — injected into both the outgoing request headers (so Server
 *      Components can read the nonce via `headers()`) and the response headers.
 *   3. Supabase `updateSession` — refreshes the session cookie on the already-localized
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
    'upgrade-insecure-requests': '',
  };

  return Object.entries(directives)
    .map(([key, value]) => (value ? `${key} ${value}` : key))
    .join('; ');
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // 1. i18n routing. Produces either a redirect, an internal rewrite, or a NextResponse.next()
  //    carrying the NEXT_LOCALE cookie. Subsequent steps augment this response in-place.
  const response = handleI18nRouting(request);

  // 2. CSP + nonce. The nonce is also written back onto the request headers so the downstream
  //    rendering layer can read it via `headers()` in `[locale]/layout.tsx`.
  const nonce = Buffer.from(nanoid()).toString('base64');
  const csp = buildCsp(nonce);

  request.headers.set('x-nonce', nonce);
  request.headers.set('content-security-policy', csp);
  response.headers.set('content-security-policy', csp);

  // 3. Supabase session refresh on the locale-aware response (mutates its cookies).
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
     *
     * Prefetch requests are excluded so the CSP nonce isn't cached across users.
     */
    {
      source:
        '/((?!api|auth/callback|monitoring|_next/static|_next/image|_vercel|favicon.ico|icon.svg|apple-icon.svg|manifest.webmanifest|robots.txt|sitemap.xml|llms\\.txt|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico)).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
