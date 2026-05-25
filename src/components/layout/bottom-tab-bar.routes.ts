/**
 * BottomTabBar mounting contract — server-safe helpers.
 *
 * Extracted from `BottomTabBar.tsx` on 2026-05-25 (PR-BETA-6 hotfix #2):
 * the component itself is a Client Component (`'use client'`), but the
 * mount gating runs in the Server Component `[locale]/layout.tsx`. Under
 * Next.js 16 + React 19 a Server Component cannot import non-component
 * values from a `'use client'` module — the boundary mixer triggers a
 * render error that takes down every page on the Vercel preview
 * ("Quelque chose s'est cassé"). Moving the pure data + pure helpers
 * here gives both sides a safe consumer.
 *
 * Contract:
 *   - No `'use client'` directive: this module is server-safe.
 *   - No React, no Next.js runtime imports: pure TS only.
 *   - Pure functions, no side effects, deterministic given their inputs.
 */

/**
 * Routes where the persistent BottomTabBar must NOT render even if the
 * visitor is authenticated. Landing keeps its marketing chrome; auth and
 * onboarding pages stay focused full-screen flows; `/offline` is the PWA
 * fallback (no nav makes sense without network); `/callback` is the OAuth
 * roundtrip (also stripped by the next-intl matcher, but belt-and-
 * suspenders). Compare against the locale-stripped pathname.
 */
export const BOTTOM_TAB_BAR_EXCLUDED_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/callback',
  '/offline',
  '/onboarding',
] as const;

/**
 * Strip the optional `localePrefix: 'as-needed'` segment from a pathname so
 * the exclusion check works regardless of the visitor's locale (default
 * `fr-BE` renders unprefixed; every other locale prefixes the URL).
 *
 * Exported so the root layout can compute the unprefixed path once and pass
 * it to `isExcludedRoute`. Lives next to the routes constant for cohesion
 * with the rest of the bar's mounting contract.
 */
export function stripLocalePrefix(pathname: string, locales: readonly string[]): string {
  for (const locale of locales) {
    if (pathname === `/${locale}`) return '/';
    if (pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(`/${locale}`.length);
    }
  }
  return pathname;
}

/**
 * Returns `true` when the bar must NOT render for the given unprefixed
 * pathname. Driven by the `BOTTOM_TAB_BAR_EXCLUDED_ROUTES` allow-list and
 * an explicit exact-match — sub-routes (e.g. `/reset-password/xxx`, if
 * ever added) would need their own entry, deliberately to avoid hiding
 * the bar by accident on a deep cockpit URL that happens to share a
 * prefix.
 */
export function isExcludedRoute(unprefixedPathname: string): boolean {
  return (BOTTOM_TAB_BAR_EXCLUDED_ROUTES as readonly string[]).includes(unprefixedPathname);
}
