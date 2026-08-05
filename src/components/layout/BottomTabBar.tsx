'use client';

import { useState, useTransition, useCallback } from 'react';
import {
  HandCoins,
  Landmark,
  LayoutDashboard,
  Menu,
  Plus,
  Receipt,
  Settings,
  Sparkles,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { usePathname } from '@/i18n/navigation';
import { AddExpenseSheet } from '@/components/expenses/AddExpenseSheet';

import { MOBILE_TAB_ITEMS, isDestinationActive, type AppDestinationId } from './app-destinations';
import { MoreSheet } from './MoreSheet';

/**
 * PR-BETA-6 — Bottom Tab Bar mobile (Apple HIG, THI-277).
 *
 * Replaces the right-to-left drawer (HeaderNav) for authenticated users on
 * mobile. Five tabs is the Apple HIG hard cap — anything else goes into the
 * "More" sheet (slide-up modal) so the bar stays scannable at a glance.
 *
 * Visibility rules (Hotfix Option A v3, 2026-05-25 — Apple HIG iOS 18
 * "persistent tab bar across in-app destinations"):
 * - Hidden ≥ 1280px (`xl:hidden`), the SAME breakpoint at which the header's
 *   app nav appears. Not 768px, where it used to stop: the nav did not arrive
 *   until 1024px, leaving a 256 px band with no navigation chrome at all
 *   (measured 2026-08-02 from an installed PWA window). And not 1024px either,
 *   the first attempt: with the admin link the header nav is 808 px wide, so
 *   at 1024–1279 the account/theme/locale block was pushed off-screen — up to
 *   155 px of it — and `overflow-x: hidden` on html+body amputated it silently
 *   instead of showing a scrollbar. 1280 px is the first width where the whole
 *   header row measures inside the viewport.
 *
 *   One seam, placed where the content actually fits, is the only arrangement
 *   in which neither surface can leave before the other arrives. Anything that
 *   reserves space for this bar moves with it; `e2e/navigation-reachable.spec.ts`
 *   asserts the whole contract against a real browser at 14 widths.
 * - Mounted at the locale root `src/app/[locale]/layout.tsx` and gated by
 *   `isAuthenticated && !isExcludedRoute(pathname)`. So the bar is present
 *   on `/app/*`, `/admin/*`, `/faq`, `/glossaire`, `/legal/*` once the user
 *   is signed in — fixes the "Admin sans retour" trap reported on iPhone
 *   smoke 2026-05-25 and the disjointed UX on resources pages.
 * - Excluded surfaces (`/`, `/login`, `/signup`, `/forgot-password`,
 *   `/reset-password`, `/callback`, `/offline`, `/onboarding`): the bar is
 *   not rendered. The landing keeps its marketing chrome; auth pages keep
 *   their focused full-screen flow; onboarding stays distraction-free.
 *
 * Active-tab detection: strict `startsWith` against the localised pathname
 * with a special case for the root `/app` route (otherwise every sub-route
 * would light up the Cockpit tab AND its own). next-intl strips the locale
 * prefix from `usePathname()` so we compare against unprefixed paths. When
 * the user is on a non-`/app/*` surface (admin, faq, legal) NO tab is
 * marked active — the bar then acts as a "return to cockpit" surface.
 *
 * Touch targets: each tab is 44×44px minimum (Apple HIG accessibility) — the
 * outer button is `h-12` (48px) and stretches via `flex-1` so the total tap
 * surface easily exceeds the minimum.
 *
 * Safe-area: `pb-[env(safe-area-inset-bottom)]` reserves the iPhone home
 * indicator area in standalone PWA mode (Add-to-Home-Screen). The site
 * declares `viewport-fit=cover` upstream in `[locale]/layout.tsx`, so the
 * inset is non-zero on real hardware.
 *
 * Haptic feedback: `navigator.vibrate(10)` is a best-effort no-op on desktop
 * and on iOS Safari (Vibration API is Android-only at time of writing).
 * Wrapped in a guard so tests under jsdom don't blow up.
 */

// PR-BETA-6 hotfix #2 (2026-05-25): the mount gating helpers
// (`BOTTOM_TAB_BAR_EXCLUDED_ROUTES`, `stripLocalePrefix`, `isExcludedRoute`)
// live in the server-safe `./bottom-tab-bar.routes` module so the Server
// Component `[locale]/layout.tsx` can import them without crossing the
// `'use client'` boundary of this file (which crashes every page render
// on Next.js 16 + React 19, observed on PR #182 preview Vercel).

/**
 * Icons and labels stay HERE, not in the registry: the registry is server-safe
 * (no React) and next-intl message keys are typed against `fr-BE.json`, so only
 * string literals type-check. Both maps are keyed by `AppDestinationId`, so
 * adding a destination without an icon or a label is a TypeScript error — the
 * same exhaustiveness the registry gives for the destinations themselves.
 *
 * Labels are per-surface on purpose. This bar says "Cockpit" / "Factures" /
 * "Simuler" (`layout.bottomTab.*`) where the desktop header says "Tableau de
 * bord" / "Charges" / "Simulateur" (`common.nav.*`). Sharing one key would have
 * silently rewritten copy that was written for each context.
 */
const TAB_ICONS: Record<AppDestinationId, LucideIcon> = {
  cockpit: LayoutDashboard,
  bills: Receipt,
  expenses: Wallet,
  simulate: Sparkles,
  commitments: HandCoins,
  accounts: Landmark,
  settings: Settings,
};

type BottomTabLabelKey = 'cockpit' | 'bills' | 'expenses' | 'simulate';

const TAB_LABELS: Record<AppDestinationId, BottomTabLabelKey | null> = {
  cockpit: 'cockpit',
  bills: 'bills',
  expenses: 'expenses',
  // Sheet-only destinations have no bottom-tab label. `simulate` joined them on
  // 2026-07-29 when the ⊕ took the third slot; its key is kept because the
  // MoreSheet reads a different namespace and this Record must stay exhaustive.
  simulate: 'simulate',
  commitments: null,
  accounts: null,
  settings: null,
};

function triggerHapticFeedback(): void {
  if (typeof navigator === 'undefined') return;
  if (typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(10);
  } catch {
    // Some browsers throw if vibration is disabled by user agent policy.
  }
}

export type BottomTabBarProps = {
  /**
   * Mirrors the `isAdmin` prop on `HeaderNav` so the More sheet can expose
   * the admin entry when the signed-in user is privileged. Server-resolved
   * upstream (`isAdmin()` in `Header.tsx` / app layout) — the client never
   * trusts itself. Default `false` keeps non-admin sessions clean.
   */
  isAdmin?: boolean;
};

export function BottomTabBar({ isAdmin = false }: BottomTabBarProps) {
  const t = useTranslations('layout.bottomTab');
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  // Lazy navigation transition — keeps the tab tap feeling instantaneous
  // while the destination Server Component is fetched.
  const [, startTransition] = useTransition();

  const handleTabClick = useCallback(() => {
    triggerHapticFeedback();
  }, []);

  const handleAddExpenseClick = useCallback(() => {
    triggerHapticFeedback();
    setIsAddExpenseOpen(true);
  }, []);

  const handleAddExpenseClose = useCallback(() => {
    setIsAddExpenseOpen(false);
  }, []);

  const handleMoreClick = useCallback(() => {
    triggerHapticFeedback();
    setIsMoreOpen(true);
  }, []);

  const handleMoreClose = useCallback(() => {
    setIsMoreOpen(false);
  }, []);

  return (
    <>
      {/*
       * `fixed bottom-0` + `pb-[env(safe-area-inset-bottom)]` reserves the
       * iPhone home indicator. `bg-background/85 backdrop-blur-xl` is the
       * Liquid Glass effect — semi-opaque background + 24px blur so the
       * cockpit content remains barely visible underneath while staying
       * readable. `border-t border-border/40` is the hairline separator.
       *
       * `z-40` matches the sticky header (which is also z-40) — they never
       * overlap on viewport because one is top-anchored and the other is
       * bottom-anchored. Below z-50 (toast / modal stack) so the More sheet
       * itself can climb above us when open.
       */}
      <nav
        aria-label={t('label')}
        data-testid="bottom-tab-bar"
        className="surface-overlay border-border/40 fixed right-0 bottom-0 left-0 z-40 border-t pb-[env(safe-area-inset-bottom)] xl:hidden"
      >
        <div className="flex h-12 items-stretch">
          {MOBILE_TAB_ITEMS.map((item) => {
            /*
             * The ⊕ (décision Q7). Visual spec, and what it deliberately is NOT:
             *
             *   NOT a floating circle overflowing above the bar (Material FAB)
             *       → a block CONTAINED in the bar, 46 × 33, radius 11
             *   NOT a heavy drop shadow    → 0 2px 8px at 35 % opacity
             *   NOT an outlined + in a ring → a regular-weight glyph on a flat
             *                                 --color-brand fill
             *   NOT labelled « Ajouter »   → no label at all; that is what says
             *                                 "I am an action, not a destination"
             *
             * The painted block is 46 × 33 as specified, but the BUTTON around
             * it is `h-12` (48 px) and `flex-1` like every other slot, so the
             * touch target clears the 44 px HIG minimum. Q7 specifies the visual
             * size; the HIG specifies the hit area. Both are satisfied because
             * they are different things — shrinking the target to 33 px to match
             * the paint would have been the wrong reading.
             */
            if (item.kind === 'action') {
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid="bottom-tab-add-expense"
                  aria-haspopup="dialog"
                  aria-expanded={isAddExpenseOpen}
                  aria-label={t('addExpense')}
                  onClick={handleAddExpenseClick}
                  className="focus-visible:ring-brand-600 flex flex-1 items-center justify-center focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                >
                  <span
                    aria-hidden="true"
                    /*
                     * `h-8.25 w-11.5` = 33 × 46 px, la taille exacte que
                     * spécifie la décision Q7 — l'échelle Tailwind vaut 4 px
                     * par unité. Les valeurs arbitraires `h-[33px] w-[46px]`
                     * rendaient les mêmes pixels, mais hors de l'échelle : elles
                     * échappaient au thème et faisaient rougir l'extension
                     * Tailwind à chaque ouverture du fichier.
                     *
                     * `rounded-[11px]` reste arbitraire, faute d'équivalent
                     * canonique (l'échelle de rayon ne descend pas à cette
                     * granularité), et `shadow-[…]` porte une variable CSS.
                     */
                    className="bg-brand-700 text-primary-foreground shadow-brand-700/35 flex h-8.25 w-11.5 items-center justify-center rounded-[11px] shadow-[0_2px_8px_var(--tw-shadow-color)]"
                  >
                    <Plus className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                </button>
              );
            }

            const Icon = TAB_ICONS[item.id];
            const labelKey = TAB_LABELS[item.id];
            const active = isDestinationActive(pathname, item);
            return (
              <Link
                key={item.id}
                href={item.href}
                data-testid={`bottom-tab-${item.id}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  handleTabClick();
                  startTransition(() => {});
                }}
                className={[
                  'focus-visible:ring-brand-600 flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
                  active
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{labelKey ? t(labelKey) : null}</span>
              </Link>
            );
          })}

          <button
            type="button"
            data-testid="bottom-tab-more"
            aria-haspopup="dialog"
            aria-expanded={isMoreOpen}
            aria-controls="more-sheet"
            onClick={handleMoreClick}
            className={[
              'focus-visible:ring-brand-600 flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
              isMoreOpen
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            <span>{t('more')}</span>
          </button>
        </div>
      </nav>

      <MoreSheet isOpen={isMoreOpen} onClose={handleMoreClose} isAdmin={isAdmin} />
      {/*
        Mounted here rather than per-page: the ⊕ is reachable from every screen
        the bar is on, which is what makes "2 taps from anywhere" true. The sheet
        fetches its own context on first open, so mounting it costs nothing until
        it is used.
      */}
      <AddExpenseSheet open={isAddExpenseOpen} onClose={handleAddExpenseClose} />
    </>
  );
}
