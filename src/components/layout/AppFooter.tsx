import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { CookiePreferencesLink } from '@/components/layout/CookiePreferencesLink';

/**
 * The footer of the signed-in app (`/app/**`) — one line, desktop only.
 *
 * Decided by @thierry on 22 September 2026 (option A), after research:
 * - below 1024 px there is NO footer. The bottom tab bar is the last thing on
 *   the screen, and its « Plus » sheet already carries the four legal links, the
 *   cookie preferences and the copyright. The old footer spent 121 px at 375 on
 *   a logo and a copyright line.
 * - from 1024 px up, where the bar is gone, this single line keeps every legal
 *   entry one click away — including withdrawing cookie consent, which GDPR
 *   art. 7(3) wants as easy as giving it. It used to appear only from 1280 px,
 *   leaving 1024–1279 with no legal link and no cookie preferences at all.
 *
 * The public pages keep their full `Footer`; this component is not a variant of
 * it, because the two answer different questions.
 *
 * Targets are 24 px tall at minimum (WCAG 2.2 SC 2.5.8) and the line stays at or
 * under 48 px — both measured in `e2e/pied-de-page-app.spec.ts`.
 */
export async function AppFooter() {
  const t = await getTranslations('footer');
  const tCommon = await getTranslations('common');

  const target =
    'text-muted-foreground hover:text-foreground focus-visible:ring-brand-600 inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm hover:underline focus-visible:ring-2 focus-visible:outline-none';

  return (
    <footer data-testid="app-footer" className="border-border hidden border-t lg:block">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-6 py-2 text-xs">
        <span className="text-muted-foreground">
          {t('copyrightNotice', { year: new Date().getFullYear() })}
        </span>
        <nav
          aria-label={tCommon('nav.footerLabel')}
          className="flex flex-wrap items-center gap-x-4"
        >
          <Link href="/legal/cgu" className={target}>
            {t('cgu')}
          </Link>
          <Link href="/legal/privacy" className={target}>
            {t('privacy')}
          </Link>
          <Link href="/legal/cookies" className={target}>
            {t('cookies')}
          </Link>
          <Link href="/faq" className={target}>
            {t('faq')}
          </Link>
          <CookiePreferencesLink className={`${target} cursor-pointer text-left`} />
        </nav>
      </div>
    </footer>
  );
}
