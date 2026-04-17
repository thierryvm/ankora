import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Per-request CSP with nonce + strict-dynamic.
 * Nonce is propagated to Server Components via the x-nonce request header,
 * which is read in src/app/layout.tsx via `headers()`.
 */
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
  const nonce = Buffer.from(nanoid()).toString('base64');
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);

  return updateSession(request, response);
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - API routes
     * - Static assets
     * - Image optimization endpoints
     * - Public brand assets
     *
     * Prefetch requests are excluded so the CSP nonce isn't cached across users.
     */
    {
      source:
        '/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.svg|manifest.webmanifest|robots.txt|sitemap.xml|llms\\.txt|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico)).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
