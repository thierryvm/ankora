/**
 * Single source of truth for the cockpit's navigation destinations.
 *
 * Why this module exists. The destinations used to be declared three times —
 * a private `TABS` array in `BottomTabBar.tsx`, hardcoded JSX in `MoreSheet.tsx`,
 * and more hardcoded JSX in `Header.tsx` — with nothing tying them together.
 * Adding a route and forgetting one or two surfaces was therefore undetectable,
 * which is exactly what happened to `/app/commitments`: it shipped in the
 * desktop header (`hidden lg:flex`) and nowhere else, so on mobile the page was
 * unreachable outside the cockpit card that links to it. Reported in production
 * by @thierry on 2026-07-25.
 *
 * The fix that matters is not "add the missing link" — it is removing the
 * ability to forget one. `app-destinations.test.ts` reads the filesystem and
 * fails when a route under `src/app/[locale]/app/` has no entry here, and when
 * an entry points at a route that no longer exists.
 *
 * Contract, mirroring `bottom-tab-bar.routes.ts` next door:
 *   - No `'use client'` directive: this module is server-safe.
 *   - No React, no Next.js runtime imports: pure TS only. That is why icons and
 *     i18n keys live in the consuming components, not here — icons are React
 *     components, and `next-intl` message keys are typed against `fr-BE.json`
 *     so only string literals type-check. Both are kept exhaustive on the
 *     consumer side through `Record<AppDestinationId, …>`.
 */

/**
 * Stable identifiers for UI destinations — NOT route folder names.
 *
 * `bills` maps to `/app/charges` and `simulate` to `/app/simulator`. The
 * mismatch is deliberate and load-bearing: these ids are baked into
 * `data-testid="bottom-tab-bills"` / `bottom-tab-simulate` and asserted in
 * `__tests__/BottomTabBar.test.tsx` and `e2e/mobile-ios/bottom-tab-bar.spec.ts`.
 * Renaming them to match the folders would break both suites for no gain — and
 * the e2e ones are `seededUser`-gated, so CI would stay green while the specs
 * silently skip. Do not "harmonise" these.
 */
export type AppDestinationId =
  | 'cockpit'
  | 'accounts'
  | 'bills'
  | 'commitments'
  | 'expenses'
  | 'simulate'
  | 'settings';

export type AppDestination = {
  id: AppDestinationId;
  href: string;
  /**
   * Whether the cockpit root is matched exactly. `/app` must be `exact`,
   * otherwise it would light up on every `/app/*` sub-route.
   */
  match: 'exact' | 'startsWith';
  /**
   * Where the destination appears on MOBILE — bottom tab bar or "more" sheet.
   *
   * Deliberately named for the platform it governs. The desktop header renders
   * the FULL list regardless of this field; a reader who assumed otherwise
   * would "fix" `Header` to filter on it and make destinations vanish from
   * desktop, which is the bug class this module exists to prevent.
   */
  mobilePlacement: 'tab' | 'sheet';
};

/**
 * Declaration order IS the display order — `.filter()` preserves it. No
 * explicit `order` field on purpose: a number duplicating the array index can
 * contradict it, and an invariant that cannot be violated beats one that has to
 * be maintained.
 */
export const APP_DESTINATIONS: readonly AppDestination[] = [
  { id: 'cockpit', href: '/app', match: 'exact', mobilePlacement: 'tab' },
  { id: 'bills', href: '/app/charges', match: 'startsWith', mobilePlacement: 'tab' },
  { id: 'expenses', href: '/app/expenses', match: 'startsWith', mobilePlacement: 'tab' },
  { id: 'simulate', href: '/app/simulator', match: 'startsWith', mobilePlacement: 'tab' },
  { id: 'commitments', href: '/app/commitments', match: 'startsWith', mobilePlacement: 'sheet' },
  { id: 'accounts', href: '/app/accounts', match: 'startsWith', mobilePlacement: 'sheet' },
  { id: 'settings', href: '/app/settings', match: 'startsWith', mobilePlacement: 'sheet' },
] as const;

/** The four bottom-tab destinations, in display order. */
export const MOBILE_TAB_DESTINATIONS: readonly AppDestination[] = APP_DESTINATIONS.filter(
  (destination) => destination.mobilePlacement === 'tab',
);

/** Destinations reachable on mobile through the "more" sheet, in display order. */
export const MOBILE_SHEET_DESTINATIONS: readonly AppDestination[] = APP_DESTINATIONS.filter(
  (destination) => destination.mobilePlacement === 'sheet',
);

/**
 * Is `destination` the one the current pathname is on?
 *
 * `pathname` must already be stripped of its locale prefix — use
 * `stripLocalePrefix` from `./bottom-tab-bar.routes`.
 */
export function isDestinationActive(pathname: string, destination: AppDestination): boolean {
  if (destination.match === 'exact') return pathname === destination.href;
  return pathname === destination.href || pathname.startsWith(`${destination.href}/`);
}
