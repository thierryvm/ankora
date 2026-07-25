/**
 * SHA-256 hashes allow-listed in the `style-src` CSP directive.
 *
 * ⚠️ This module MUST stay free of imports. It is consumed both by
 * `src/proxy.ts` (Edge middleware) and by `tests/csp-style-hashes.test.ts`.
 * Importing `src/proxy.ts` from Vitest is impossible — it pulls in
 * `src/lib/supabase/middleware.ts` → `src/lib/env.ts`, which throws at module
 * load when the env vars are absent, and `tests/setup.ts` stubs none of them.
 *
 * ── Why these hashes exist ────────────────────────────────────────────────
 * `sonner` (toast library) injects its stylesheet at module evaluation time,
 * and does it in the worst possible order (`node_modules/sonner/dist/index.mjs`):
 *
 *     head.appendChild(style)                       // inserted EMPTY  → check #1
 *     style.appendChild(document.createTextNode(css)) // filled AFTER  → check #2
 *
 * One element, two CSP evaluations, hence exactly two violations on every page
 * — `<Toaster />` is mounted unconditionally in `src/app/[locale]/layout.tsx`.
 * Both hashes below were confirmed against production violations on 2026-07-25
 * by re-hashing the literal extracted from the installed package.
 *
 * `sonner` exposes no nonce API (zero occurrences of "nonce" in the package),
 * so allow-listing the two hashes is the only way to silence it short of
 * replacing the library.
 *
 * ── Security rationale ────────────────────────────────────────────────────
 * Both are element hashes for `<style>` tags, so no `'unsafe-hashes'` is
 * needed (that keyword only concerns inline `style=` ATTRIBUTES) and
 * `'unsafe-inline'` stays absent.
 *
 * Allow-listing the empty-string hash is safe: it permits a `<style>` element
 * with no content. Filling it later from the DOM is re-evaluated by the CSP —
 * that re-evaluation is precisely what produces the second violation. The only
 * theoretical residue is that once the element is allowed, its CSSOM object
 * exists and `sheet.insertRule()` is not subject to CSP; but that requires JS
 * execution, and an attacker able to run JS can already call `insertRule()` on
 * any of our existing same-origin stylesheets. The attack surface `style-src`
 * actually defends against — HTML injection WITHOUT script execution
 * (attribute-selector exfiltration, overlay/clickjacking) — is unchanged by an
 * empty `<style>`.
 *
 * ── Drift ─────────────────────────────────────────────────────────────────
 * `SONNER_STYLE_HASH` pins one specific version of the sonner CSS. Upgrading
 * the package changes the literal and would silently bring the violation back.
 * `tests/csp-style-hashes.test.ts` re-extracts and re-hashes the literal from
 * `node_modules` on every CI run and fails loudly when they diverge.
 *
 * Note that the allow-list is a belt-and-braces measure for a clean console:
 * the toast styling itself comes from the `'self'` stylesheet imported in
 * `src/app/globals.css`, which keeps the UI correct even if this hash drifts.
 */

/** SHA-256 of the empty string — the `<style>` element sonner inserts empty. */
export const EMPTY_STYLE_HASH = "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='";

/** SHA-256 of the CSS literal sonner writes into that element. */
export const SONNER_STYLE_HASH = "'sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY='";

/** Every hash to append to `style-src`, in a stable order. */
export const STYLE_SRC_HASHES = [EMPTY_STYLE_HASH, SONNER_STYLE_HASH] as const;
