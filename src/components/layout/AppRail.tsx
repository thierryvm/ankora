'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

import { Link } from '@/i18n/navigation';
import { LayoutDashboard, Receipt, Wallet, HandCoins, Settings } from 'lucide-react';

import { APP_DESTINATIONS, isDestinationActive, type AppDestinationId } from './app-destinations';
import { stripLocalePrefix } from './bottom-tab-bar.routes';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The desktop navigation rail — the app's destinations, vertically, on the left.
 *
 * ## Why a rail, and why it is not just a restyled header nav
 *
 * The header used to carry the full destination list horizontally, and that row
 * measured 808 px with the admin link present. At 1024–1279 px the remaining
 * block (account, theme, language) had nowhere to go, so it was amputated in
 * silence by `overflow-x: clip` — which is exactly why the bottom bar hid at
 * `xl` (1280) rather than at `lg` (1024), leaving a 256 px band of desktop
 * widths served by a phone bar.
 *
 * Moving the destinations out of the bar is what makes 1024 possible again.
 * The threshold is therefore not a preference; it is a consequence, and the
 * shell spec measures it rather than trusting this paragraph.
 *
 * ## One registry, never a second list
 *
 * The entries come from `APP_DESTINATIONS`, the same array the bottom bar and
 * the "more" sheet read. `app-destinations.test.ts` walks the filesystem and
 * fails when a route exists without an entry — a hand-written list here would
 * step outside that guard, and `/app/commitments` going missing on mobile is
 * precisely what the guard was built after.
 *
 * `mobilePlacement` is deliberately ignored: it governs the phone split (tab
 * vs sheet), never this surface. Filtering on it would make destinations
 * vanish from desktop.
 */

/** Icons live here, not in the registry: that module is server-safe, pure TS. */
const ICONS: Record<AppDestinationId, typeof LayoutDashboard> = {
  cockpit: LayoutDashboard,
  bills: Receipt,
  expenses: Wallet,
  commitments: HandCoins,
  accounts: Wallet,
  settings: Settings,
};

/**
 * Message keys, exhaustive by construction. `next-intl` types keys against
 * `fr-BE.json`, so only string literals type-check — and `Record<AppDestinationId, …>`
 * makes the typecheck fail if a destination is added without its label. No new
 * key is introduced by this component: it reuses the ones the header nav and
 * the bottom bar already carry, in all five locales.
 */
const LABEL_KEYS: Record<
  AppDestinationId,
  | 'nav.dashboard'
  | 'nav.accounts'
  | 'nav.charges'
  | 'nav.commitments'
  | 'nav.expenses'
  | 'nav.settings'
> = {
  cockpit: 'nav.dashboard',
  accounts: 'nav.accounts',
  bills: 'nav.charges',
  commitments: 'nav.commitments',
  expenses: 'nav.expenses',
  settings: 'nav.settings',
};

export function AppRail() {
  const t = useTranslations('common');
  const pathname = stripLocalePrefix(usePathname() ?? '/', routing.locales);

  return (
    <nav
      aria-label={t('nav.appLabel')}
      data-testid="app-rail"
      className={cn(
        // Hidden below 1024: under that width the bottom bar is the single
        // navigation surface, and the shell spec asserts that exactly one of
        // the two is visible at every width.
        'hidden lg:block',
        // The header is its 56 px token PLUS a 1 px bottom border. Without that pixel the
        // rail sat 1 px under the header (hidden by it) and, being screen-high, made
        // every page at 1024+ scroll by 1 px — even an empty one.
        'border-border-bar sticky top-[calc(var(--size-topbar)+1px+env(safe-area-inset-top))]',
        'h-[calc(100svh-var(--size-topbar)-1px-env(safe-area-inset-top))] w-60 shrink-0 border-r',
        'px-3 py-6',
      )}
    >
      <ul className="flex flex-col gap-1">
        {APP_DESTINATIONS.map((destination) => {
          const Icon = ICONS[destination.id];
          const active = isDestinationActive(pathname, destination);

          return (
            <li key={destination.id}>
              <Link
                href={destination.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // 44px of height: the rail is pointer-first, but a hybrid
                  // laptop is still a touch device, and the floor costs nothing.
                  'relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm',
                  'transition-[background-color,color] duration-[var(--dur-state)] ease-[var(--ease-spring)]',
                  'focus-visible:ring-brand-600 focus-visible:ring-2 focus-visible:outline-none',
                  'hover:bg-control-hover active:bg-control-pressed',
                  active
                    ? // The active mark is a bar AND a colour AND `aria-current`.
                      // Colour alone would say it to sighted users only, and to
                      // no one at all in forced-colours mode.
                      'text-brand-text before:bg-brand-text font-semibold before:absolute before:top-2.5 before:bottom-2.5 before:left-0 before:w-[3px] before:rounded-full before:content-[""]'
                    : 'text-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {t(LABEL_KEYS[destination.id])}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
