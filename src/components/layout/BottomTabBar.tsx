'use client';

import { useState, useTransition, useCallback } from 'react';
import { LayoutDashboard, Receipt, Wallet, Sparkles, Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { usePathname } from '@/i18n/navigation';
import { MoreSheet } from './MoreSheet';

/**
 * PR-BETA-6 — Bottom Tab Bar mobile (Apple HIG, THI-277).
 *
 * Replaces the right-to-left drawer (HeaderNav) for the `app` variant on
 * mobile. Five tabs is the Apple HIG hard cap — anything else goes into the
 * "More" sheet (slide-up modal) so the bar stays scannable at a glance.
 *
 * Visibility rules:
 * - Hidden ≥ 768px (`md:hidden`) — desktop keeps the top-of-page nav.
 * - Mounted ONLY in `/app/*` (driven by `src/app/[locale]/app/layout.tsx`)
 *   so the marketing surfaces (landing, FAQ, legal, glossary) preserve their
 *   existing mobile drawer until the marketing nav is reworked separately.
 *
 * Active-tab detection: strict `startsWith` against the localised pathname
 * with a special case for the root `/app` route (otherwise every sub-route
 * would light up the Cockpit tab AND its own). next-intl strips the locale
 * prefix from `usePathname()` so we compare against unprefixed paths.
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
type TabId = 'cockpit' | 'bills' | 'expenses' | 'simulate' | 'more';

type Tab = {
  id: TabId;
  href: string;
  labelKey: 'cockpit' | 'bills' | 'expenses' | 'simulate' | 'more';
  // Mark routes that must use a startsWith comparison vs the exact-match
  // `/app` root. We only have one exact-match tab today but keeping the
  // shape explicit prevents a future refactor from quietly breaking the
  // cockpit highlight.
  match: 'exact' | 'startsWith';
  icon: typeof LayoutDashboard;
};

const TABS: readonly Tab[] = [
  { id: 'cockpit', href: '/app', labelKey: 'cockpit', match: 'exact', icon: LayoutDashboard },
  { id: 'bills', href: '/app/charges', labelKey: 'bills', match: 'startsWith', icon: Receipt },
  {
    id: 'expenses',
    href: '/app/expenses',
    labelKey: 'expenses',
    match: 'startsWith',
    icon: Wallet,
  },
  {
    id: 'simulate',
    href: '/app/simulator',
    labelKey: 'simulate',
    match: 'startsWith',
    icon: Sparkles,
  },
] as const;

function isActive(pathname: string, tab: Tab): boolean {
  if (tab.match === 'exact') return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

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
  // Lazy navigation transition — keeps the tab tap feeling instantaneous
  // while the destination Server Component is fetched.
  const [, startTransition] = useTransition();

  const handleTabClick = useCallback(() => {
    triggerHapticFeedback();
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
        className="bg-background/85 border-border/40 fixed right-0 bottom-0 left-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <div className="flex h-12 items-stretch">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(pathname, tab);
            return (
              <Link
                key={tab.id}
                href={tab.href}
                data-testid={`bottom-tab-${tab.id}`}
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
                <span>{t(tab.labelKey)}</span>
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
    </>
  );
}
