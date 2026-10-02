import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import * as React from 'react';

import { ThemeToggle, type Theme } from '@/components/ui/theme-toggle';

import { LangSwitcherClient } from './_client/LangSwitcherClient';

/**
 * Admin topbar — Server Component.
 *
 * Reads the `theme` cookie SSR-side to seed `ThemeToggle.initialTheme` so the
 * client toggle shows the correct icon on first render (no hydration flash).
 * The toggle itself owns the cookie write + `data-theme` attribute mutation —
 * no Server Action needed.
 *
 * `LangSwitcherClient` is a thin Client wrapper around `LangSwitcher` that
 * wires `onChange` to next-intl's `router.replace(pathname, { locale })`.
 * The handler cannot be defined Server-side (function not serializable).
 *
 * The amber « Admin » pill is persistent (design brief §3.4): amber is the
 * admin's accent, teal the app's, so the two are never mistaken for each other.
 */
export async function AdminTopbar({ locale }: { locale: string }): Promise<React.JSX.Element> {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('theme')?.value;
  const initialTheme: Theme = themeCookie === 'dark' ? 'dark' : 'light';
  const t = await getTranslations('admin');

  return (
    <header className="surface-overlay border-border sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 md:px-6">
      <div className="flex items-center gap-3">
        <span className="font-semibold">Ankora</span>
        <span className="border-accent-text text-accent-text bg-accent-text/10 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase">
          {t('pill')}
        </span>
        <span className="text-muted-foreground hidden text-xs sm:inline">{t('zone')}</span>
      </div>

      <div className="flex items-center gap-2">
        <LangSwitcherClient currentLocale={locale} />
        <ThemeToggle initialTheme={initialTheme} />
      </div>
    </header>
  );
}
