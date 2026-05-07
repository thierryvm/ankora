'use client';

import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';

/** Literal union of allowed i18n keys under `app.breadcrumbs` — keeps next-intl
    typed-translations happy without resorting to `as never`. */
type BreadcrumbKey =
  | 'dashboard'
  | 'accounts'
  | 'charges'
  | 'expenses'
  | 'simulator'
  | 'settings'
  | 'deletionStatus';

type Segment = {
  key: BreadcrumbKey;
  href: string;
};

/**
 * Static mapping pathname → segments AFTER the always-present "dashboard" root.
 * `/app` itself returns null (it IS the dashboard, no breadcrumb needed).
 *
 * Keep this list in sync with the routes declared under `src/app/[locale]/app/`.
 */
const PATH_TO_SEGMENTS: Record<string, Segment[]> = {
  '/app/accounts': [{ key: 'accounts', href: '/app/accounts' }],
  '/app/charges': [{ key: 'charges', href: '/app/charges' }],
  '/app/expenses': [{ key: 'expenses', href: '/app/expenses' }],
  '/app/simulator': [{ key: 'simulator', href: '/app/simulator' }],
  '/app/settings': [{ key: 'settings', href: '/app/settings' }],
  '/app/settings/deletion-status': [
    { key: 'settings', href: '/app/settings' },
    { key: 'deletionStatus', href: '/app/settings/deletion-status' },
  ],
};

export function AppBreadcrumbs() {
  const pathname = usePathname();
  const t = useTranslations('app.breadcrumbs');

  const normalized = pathname.replace(/\/+$/, '') || '/';
  const tail = PATH_TO_SEGMENTS[normalized];

  // Dashboard root or unmapped path: render nothing.
  if (!tail || tail.length === 0) return null;

  const dashboard: Segment = { key: 'dashboard', href: '/app' };
  const items = [dashboard, ...tail];

  // Mobile compact: when chain > 2, hide middle segments behind a "…" separator
  // (kept inert — purely visual). Desktop always shows the full chain.
  // For our current routing depth (max 3 segments), compact mode only kicks in
  // on /app/settings/deletion-status, where it collapses "Paramètres" to "…".
  const showCompact = items.length > 2;

  return (
    <nav aria-label="breadcrumb" className="border-border/40 border-b">
      <div className="mx-auto w-full max-w-6xl px-4 py-3 md:px-6">
        <ol className="flex items-center gap-1.5 text-sm">
          {/* Mobile compact chain */}
          {showCompact ? (
            <>
              <li className="flex items-center gap-1.5 sm:hidden">
                <Link
                  href={dashboard.href}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t(dashboard.key)}
                </Link>
              </li>
              <li
                className="text-muted-foreground/60 flex items-center gap-1.5 sm:hidden"
                aria-hidden="true"
              >
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>…</span>
              </li>
              <li className="flex items-center gap-1.5 sm:hidden">
                <ChevronRight
                  className="text-muted-foreground/60 h-3.5 w-3.5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span aria-current="page" className="text-foreground font-medium">
                  {t(items[items.length - 1]!.key)}
                </span>
              </li>
            </>
          ) : null}

          {/* Desktop / non-compact: full chain. Hidden on mobile when
              `showCompact` is true so the two layouts don't double-render. */}
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            const hideOnMobile = showCompact ? 'hidden sm:flex' : 'flex';

            return (
              <li key={item.href} className={`${hideOnMobile} items-center gap-1.5`}>
                {index > 0 && (
                  <ChevronRight
                    className="text-muted-foreground/60 h-3.5 w-3.5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                )}
                {isLast ? (
                  <span aria-current="page" className="text-foreground font-medium">
                    {t(item.key)}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t(item.key)}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
