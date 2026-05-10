import { cookies } from 'next/headers';
import * as React from 'react';

import { ThemeToggle, type Theme } from '@/components/atoms';

import { LangSwitcherClient } from './_client/LangSwitcherClient';

/**
 * Admin topbar — Server Component.
 *
 * Reads the `theme` cookie SSR-side to seed `ThemeToggle.initialTheme` so the
 * client toggle shows the correct icon on first render (no hydration flash).
 * The atom itself owns the cookie write + `data-theme` attribute mutation
 * (cf. ThemeToggle Task 12, PR-D4-PHASE2-A) — no Server Action needed.
 *
 * `LangSwitcherClient` is a thin Client wrapper around the LangSwitcher atom
 * that wires `onChange` to next-intl's `router.replace(pathname, { locale })`.
 * The handler cannot be defined Server-side (function not serializable).
 *
 * Design intent: the topbar surface stays minimal in PR-D4-PHASE2-B — just
 * the locale + theme controls. Future PRs (B2 admin panel) will add nav,
 * "Zone admin · réservée fondateur" badge, period selector, user menu.
 */
export async function AdminTopbar({ locale }: { locale: string }): Promise<React.JSX.Element> {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('theme')?.value;
  const initialTheme: Theme = themeCookie === 'dark' ? 'dark' : 'light';

  return (
    <header className="border-border bg-card/60 sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 backdrop-blur md:px-6">
      <div className="flex items-center gap-3">
        <span className="font-semibold">Ankora · Admin</span>
        <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
          Zone admin · réservée fondateur
        </span>
      </div>

      <div className="flex items-center gap-2">
        <LangSwitcherClient currentLocale={locale} />
        <ThemeToggle initialTheme={initialTheme} />
      </div>
    </header>
  );
}
