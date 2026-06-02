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
    // Public marketing / shell — SAFE to cache, must NOT be matched.
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
  ])('does NOT match (cacheable public surface): %s', (pathname) => {
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
