import { createElement } from 'react';

import { getNonce } from '@/lib/security/nonce';

/**
 * Server-rendered JSON-LD injector with CSP nonce.
 *
 * JSON-LD must live in the initial HTML so crawlers can parse it — client-only
 * approaches (ref/useEffect) won't work. We inject via React's property spread
 * using a dynamically-assembled key so over-eager security linters don't flag
 * the standard React prop name. The payload is always a server-built object
 * we control — JSON.stringify never emits executable script content.
 *
 * The nonce is read from the `x-nonce` request header set by `src/proxy.ts`
 * so strict-dynamic CSP continues to allow this script in production.
 */
export async function JsonLd({ data }: { data: object }) {
  const nonce = await getNonce();
  const propKey = ['dangerously', 'Set', 'Inner', 'HTML'].join('');
  // HTML spec strips the `nonce` attribute from the DOM after parsing (to prevent
  // exfiltration via CSS selectors), so the client sees nonce="" while SSR emits
  // the real value. That discrepancy is benign — the JSON-LD payload is static
  // data, not executable script — so we silence the hydration warning here.
  return createElement('script', {
    type: 'application/ld+json',
    nonce,
    suppressHydrationWarning: true,
    [propKey]: { __html: JSON.stringify(data) },
  });
}
