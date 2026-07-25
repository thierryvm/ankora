import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * THI-324 — `public/sw.js` is a CLASSIC service worker (uses `self`,
 * `addEventListener`), so it cannot be imported as an ESM module.
 *
 * To keep ONE source of truth and zero drift, we read the shipped file and
 * extract the `PROTECTED_LOCALED` regex literal verbatim, rebuilding it with
 * `new RegExp` (a regex — NOT `eval`/`new Function`, so no code-execution
 * surface; a malformed pattern would simply throw here). The locale-aware regex
 * is the THI-324 fix and the security-critical part, so it is tested exhaustively
 * against the bypass truth-table.
 *
 * The non-localized prefixes (`/auth`, `/api`, `/_next/data`, `/fonts/`) are
 * plain `startsWith` checks in `isBypass`; we guard them against silent removal
 * by asserting their presence in the shipped source (anti-drift), which avoids
 * having to eval the whole function.
 */
const swSource = readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');

function extractProtectedLocaled(): RegExp {
  const match = swSource.match(/const PROTECTED_LOCALED\s*=\s*\/([\s\S]*?)\/;/);
  if (!match) {
    throw new Error('sw.js: PROTECTED_LOCALED literal not found — update the extractor');
  }
  return new RegExp(match[1]!);
}

const PROTECTED_LOCALED = extractProtectedLocaled();
const matches = (pathname: string) => PROTECTED_LOCALED.test(pathname);

describe('sw.js PROTECTED_LOCALED — authenticated page surfaces, locale-aware (THI-324)', () => {
  it.each([
    // Default locale (unprefixed) — already matched before THI-324.
    '/app',
    '/app/charges',
    '/admin',
    '/login',
    '/signup',
    '/signup/check-email',
    '/forgot-password',
    '/reset-password',
    '/onboarding',
    // Locale-prefixed — the THI-324 regression (were CACHED before the fix).
    '/en/app',
    '/fr-BE/app/charges',
    '/nl-BE/app',
    '/en/admin',
    '/es-ES/login',
    '/de-DE/onboarding',
    '/de-DE/reset-password',
  ])('matches (→ bypassed, never cached): %s', (pathname) => {
    expect(matches(pathname)).toBe(true);
  });

  it.each([
    // Public, non-authenticated surfaces — outside PROTECTED_LOCALED.
    // NOTE: "not bypassed" no longer implies "cached". Since 2026-07-25 the
    // worker caches only what CACHEABLE_ASSET allows, so these documents go to
    // the network like any other page — see the allowlist tests below.
    '/',
    '/en',
    '/pricing',
    '/en/faq',
    '/offline',
    '/manifest.webmanifest',
    // Boundary checks vs the old loose `startsWith('/app')`.
    '/applications',
    '/app-store',
    '/en/applications',
  ])('does NOT match PROTECTED_LOCALED (public surface): %s', (pathname) => {
    expect(matches(pathname)).toBe(false);
  });
});

describe('sw.js — non-localized bypass prefixes stay present (anti-drift guard)', () => {
  // These are plain `startsWith` in `isBypass`; a silent removal would re-open a
  // cache path for an infra/auth surface.
  it.each([
    "startsWith('/auth')",
    "startsWith('/api')",
    "startsWith('/_next/data')",
    "startsWith('/fonts/')",
  ])('isBypass still contains %s', (snippet) => {
    expect(swSource).toContain(snippet);
  });
});

describe('sw.js — security-critical slugs stay covered (anti-drift guard)', () => {
  it.each(['app', 'admin', 'login', 'signup', 'forgot-password', 'reset-password', 'onboarding'])(
    'PROTECTED_LOCALED still covers the auth-sensitive slug: %s',
    (slug) => {
      // A silent removal of any of these would re-open a cache leak for that
      // surface (unprefixed AND locale-prefixed) — fail loudly.
      expect(matches(`/${slug}`)).toBe(true);
      expect(matches(`/en/${slug}`)).toBe(true);
    },
  );
});

describe('sw.js — caching allowlist (2026-07-25 locale/session bug)', () => {
  // Root cause, measured in prod-build Cache Storage after one locale switch:
  // 8 `?_rsc=` entries (including English ones) plus the `/` document, all
  // served cache-first. The locale silently reverted to the cached English
  // render and `updateSession` never ran, so the session went stale.

  it('never pre-caches the root document (it is locale-negotiated)', () => {
    const precache = swSource.match(/const PRECACHE_URLS = \[([\s\S]*?)\]/)?.[1] ?? '';
    expect(precache).not.toMatch(/(^|[\s,])'\/'/);
    expect(precache).toMatch(/'\/offline'|OFFLINE_URL/);
  });

  it('routes page navigations to the network with /offline as the only fallback', () => {
    expect(swSource).toMatch(/request\.mode === 'navigate'/);
    // The fallback must be the dedicated offline document — never the page's
    // own cached copy, which is what resurrected the stale locale/session.
    const navBranch = swSource.match(/request\.mode === 'navigate'[\s\S]*?^  }/m)?.[0] ?? '';
    expect(navBranch).toMatch(/caches\.match\(OFFLINE_URL\)/);
    expect(navBranch).not.toMatch(/caches\.match\(request\)/);
    expect(navBranch).not.toMatch(/cache\.put/);
  });

  it('declares an allowlist of immutable assets rather than caching everything else', () => {
    expect(swSource).toMatch(/const CACHEABLE_ASSET\s*=/);
    expect(swSource).toMatch(/if \(!CACHEABLE_ASSET\.test\(url\.pathname\)/);
  });

  it('keeps RSC payloads out of the cache — they carry locale and session state', () => {
    const allowlist = swSource.match(/const CACHEABLE_ASSET =\s*([\s\S]*?);/)?.[1] ?? '';
    expect(allowlist).not.toMatch(/_rsc/);
    // A pathname-only allowlist can't match `?_rsc=` query strings, and RSC
    // requests target page paths — so they fall through to the network.
    expect(allowlist).toContain('_next');
    expect(allowlist).toContain('static');
  });

  it('strips the redirect flag from the pre-cached offline document', () => {
    // `/offline` is locale-negotiated: for an `en` visitor the precache fetch
    // follows a 307 and stores `redirected === true`, which throws a TypeError
    // when returned from respondWith() on a navigate request.
    expect(swSource).toMatch(/new Response\(await res\.blob\(\)/);
  });

  it('bumped CACHE_VERSION so poisoned caches are evicted on activation', () => {
    const version = swSource.match(/const CACHE_VERSION = '([^']+)'/)?.[1] ?? '';
    expect(version).not.toBe('ankora-v3-20260602');
    expect(version).toMatch(/^ankora-v\d+-\d{8}$/);
  });
});
