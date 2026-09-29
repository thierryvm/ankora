import { LOCALES } from '@/i18n/routing';

/**
 * Where a sign-in may send the visitor back to (`?next=`).
 *
 * Returns a same-origin path WITHOUT its locale prefix, or `null`. The caller
 * redirects through the locale-aware helpers, which re-apply the current
 * locale — so `/en/app` must come back as `/app`, never be prefixed twice.
 *
 * The check is structural, not a blocklist of known tricks: the value is
 * resolved against a sentinel origin, and anything that resolves elsewhere is
 * refused. Backslashes, control characters and percent-encoded slashes are
 * refused up front because browsers and servers disagree on them (`/\host`
 * is read as `//host` by the WHATWG parser — an open redirect for French
 * visitors, whose URLs carry no prefix to neutralise it).
 */
const SENTINEL = 'https://next.invalid';
const MAX_LENGTH = 512;
const AUTH_PAGES = ['/login', '/signup', '/forgot-password', '/reset-password', '/auth'];

export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_LENGTH) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;

  if (/[\\\u0000-\u001f\u007f]/.test(raw) || /%(2f|5c)/i.test(raw)) return null;

  let url: URL;
  try {
    url = new URL(raw, SENTINEL);
  } catch {
    return null;
  }
  if (url.origin !== SENTINEL) return null;
  // A value the parser REWRITES is refused, not trusted after the rewrite:
  // dot segments (`/.//host`, `/%2e//host`) resolve into `//host`, which
  // passes the origin check here and leaves the site once redirected.
  const rawPath = raw.split(/[?#]/, 1)[0];
  if (url.pathname !== rawPath) return null;

  let pathname = url.pathname;
  const first = pathname.split('/')[1] ?? '';
  if ((LOCALES as readonly string[]).includes(first)) {
    pathname = pathname.slice(first.length + 1) || '/';
  }

  // Dropping the locale drops a segment: `/en//host` would become `//host`.
  if (!/^\/(?![/\\])/.test(pathname)) return null;

  if (AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return `${pathname}${url.search}${url.hash}`;
}
