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
  // Moved from 'tab' to 'sheet' on 2026-07-29 to free the third slot for the ⊕
  // action (décision Q7). The simulator is a monthly decision tool, not a daily
  // consultation — of the four tabs it was the one whose visit frequency least
  // justified a permanent slot, and it keeps a first-class entry in the More
  // sheet plus its in-page drawer on the cockpit.
  { id: 'simulate', href: '/app/simulator', match: 'startsWith', mobilePlacement: 'sheet' },
  { id: 'commitments', href: '/app/commitments', match: 'startsWith', mobilePlacement: 'sheet' },
  { id: 'accounts', href: '/app/accounts', match: 'startsWith', mobilePlacement: 'sheet' },
  { id: 'settings', href: '/app/settings', match: 'startsWith', mobilePlacement: 'sheet' },
] as const;

/**
 * The ⊕ at the centre of the bar (décision Q7) — an ACTION, not a destination.
 *
 * ## Why it is not in `APP_DESTINATIONS`
 *
 * That array is guarded by `app-destinations.test.ts`, which reads the
 * filesystem and fails when an entry points at a route that does not exist. The
 * ⊕ opens a sheet; it has no route. Giving it a fake `href` to fit the shape
 * would have meant loosening the guard that exists to catch precisely that —
 * and that guard is the reason `/app/commitments` can never go missing on
 * mobile again. A separate declaration keeps the registry's invariant total.
 *
 * ## The tension this records, rather than hides
 *
 * Q7 names it: four tabs change view and keep their state, the fifth opens a
 * modal. That is a genuine break in the tab-bar contract, and the ⊕ centre is an
 * Instagram/TikTok pattern, not an Apple one — no system iOS app puts an action
 * in its tab bar, and the HIG treats tabs as persistent destinations.
 *
 * It is kept anyway, for a reason that outweighs both: **frequency**. Recording
 * an expense is the most frequent action in the app and costs 4 taps plus a
 * scroll today. No other position gives 2 taps from any screen. The visual
 * treatment carries the difference — a filled block, and no label, where the
 * four destinations have an outline icon and a label.
 */
export type AppAction = { readonly id: 'addExpense' };

export const ADD_EXPENSE_ACTION: AppAction = { id: 'addExpense' } as const;

/** A slot in the mobile tab bar: either a destination or the ⊕ action. */
export type MobileTabItem =
  | ({ kind: 'destination' } & AppDestination)
  | ({ kind: 'action' } & AppAction);

/**
 * The bar's slots, in display order: Mois · Factures · ⊕ · Dépenses — with
 * « Plus » rendered as a fifth slot by `BottomTabBar` itself.
 *
 * Derived from `APP_DESTINATIONS` rather than re-listed, so a destination
 * cannot appear here and nowhere else (or vice versa). The ⊕ is spliced into
 * the middle: index 2 of 5 is the centre of the bar, which is the whole point
 * of the decision.
 */
export const MOBILE_TAB_ITEMS: readonly MobileTabItem[] = (() => {
  const tabs = APP_DESTINATIONS.filter((d) => d.mobilePlacement === 'tab').map(
    (d) => ({ kind: 'destination', ...d }) as MobileTabItem,
  );
  const middle = Math.ceil(tabs.length / 2);
  return [
    ...tabs.slice(0, middle),
    { kind: 'action', ...ADD_EXPENSE_ACTION },
    ...tabs.slice(middle),
  ];
})();

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
