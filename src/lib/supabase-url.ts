import { z } from 'zod';

/**
 * A Supabase URL the CSP can name: http(s), and a host made of letters, digits,
 * dots and hyphens, with an optional port. `src/proxy.ts` writes this host
 * verbatim into the Content-Security-Policy header, where a `;`, a quote or a
 * comma would open a new directive. `z.string().url()` alone accepts those.
 *
 * IPv6 literals are refused on purpose: a bracketed address is not a valid CSP
 * host-source, so accepting one would ship a policy the browser silently
 * ignores. The local stack is reached through 127.0.0.1.
 */
export function isPlainHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    /^[a-z0-9.-]+(:\d{1,5})?$/.test(url.host)
  );
}

/** Checked at env load, so a bad value fails the build instead of each request. */
export const supabaseUrlSchema = z
  .string()
  .url()
  .refine(isPlainHttpUrl, 'must be an http(s) URL with a plain host');
