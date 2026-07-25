import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  EMPTY_STYLE_HASH,
  SONNER_STYLE_HASH,
  STYLE_SRC_HASHES,
} from '@/lib/security/csp-style-hashes';

/**
 * Drift guard for the `style-src` allow-list.
 *
 * `sonner` injects its stylesheet at module evaluation time and exposes no
 * nonce API, so two SHA-256 hashes are pinned in the CSP (see
 * `src/lib/security/csp-style-hashes.ts` for the full rationale). Upgrading the
 * package changes the CSS literal, which would silently bring the production
 * violation back and leave the console dirty again. This test re-extracts the
 * literal from the installed package on every CI run and fails loudly when the
 * two diverge.
 *
 * `src/proxy.ts` is deliberately NOT imported here: it pulls in
 * `src/lib/supabase/middleware.ts` → `src/lib/env.ts`, which throws at module
 * load without the env vars. The wiring of these hashes into the emitted
 * directive is asserted end-to-end in `e2e/security-headers.spec.ts`.
 */

const require = createRequire(import.meta.url);

/** Number of `__insertCSS(...)` call sites expected in the shipped bundle. */
const EXPECTED_INSERT_CSS_CALLS = 2;
/** The real sonner stylesheet is ~15 kB; anything tiny means the regex broke. */
const MIN_PLAUSIBLE_CSS_LENGTH = 1000;

/**
 * Locate sonner's ESM bundle. `sonner/dist/index.mjs` cannot be resolved
 * directly — the package's `exports` map does not expose deep subpaths — so we
 * resolve the public entry point and walk to its sibling.
 */
function readSonnerBundle(): string {
  const entry = require.resolve('sonner');
  const bundle = join(dirname(entry), 'index.mjs');
  if (!existsSync(bundle)) {
    throw new Error(
      `sonner's ESM bundle was not found at ${bundle}. The package layout ` +
        'changed — re-derive the CSP style hashes by hand before trusting this test.',
    );
  }
  return readFileSync(bundle, 'utf8');
}

/** Every string literal passed to sonner's `__insertCSS(...)` helper. */
function extractInjectedCss(bundle: string): string[] {
  const pattern = /__insertCSS\(\s*(['"`])([\s\S]*?)\1\s*\)/g;
  return [...bundle.matchAll(pattern)].map((match) => match[2] ?? '');
}

const sha256Base64 = (input: string) =>
  `'sha256-${createHash('sha256').update(input, 'utf8').digest('base64')}'`;

describe('CSP style-src hashes — drift guard', () => {
  it('still finds sonner’s CSS injection sites (guards against a broken regex)', () => {
    const bundle = readSonnerBundle();
    // A silent "0 matches" would make every assertion below vacuously true.
    expect(
      bundle.split('__insertCSS(').length - 1,
      'sonner no longer uses __insertCSS — re-derive the hashes by hand',
    ).toBe(EXPECTED_INSERT_CSS_CALLS);

    const injected = extractInjectedCss(bundle);
    expect(injected, 'the __insertCSS literal could not be extracted').toHaveLength(1);
    expect(
      injected[0]?.length ?? 0,
      'extracted CSS is implausibly short — the regex matched the wrong thing',
    ).toBeGreaterThan(MIN_PLAUSIBLE_CSS_LENGTH);
  });

  it('matches the hash pinned in the CSP allow-list', () => {
    const [css] = extractInjectedCss(readSonnerBundle());
    expect(
      sha256Base64(css ?? ''),
      'sonner’s stylesheet changed — update SONNER_STYLE_HASH, then verify the ' +
        'console is clean on a production build before merging',
    ).toBe(SONNER_STYLE_HASH);
  });

  it('pins the empty-string hash for the element sonner inserts before filling it', () => {
    expect(sha256Base64('')).toBe(EMPTY_STYLE_HASH);
  });

  it('exposes both hashes to the directive builder', () => {
    expect(STYLE_SRC_HASHES).toEqual([EMPTY_STYLE_HASH, SONNER_STYLE_HASH]);
    // Element hashes must never be paired with 'unsafe-hashes' (that keyword
    // only concerns inline `style=` attributes) nor with 'unsafe-inline'.
    for (const hash of STYLE_SRC_HASHES) {
      expect(hash).toMatch(/^'sha256-[A-Za-z0-9+/]+=*'$/);
    }
  });
});
