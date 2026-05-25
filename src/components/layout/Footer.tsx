import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { BrandHomeLink } from '@/components/brand/BrandHomeLink';
import { CookiePreferencesLink } from '@/components/layout/CookiePreferencesLink';
import { shouldMountBottomTabBar } from '@/lib/layout/bottom-tab-bar-state';

export async function Footer() {
  const t = await getTranslations('footer');
  const tCommon = await getTranslations('common');

  // PR-BETA-6 hotfix #4 (THI-277, 2026-05-25, @thierry iPhone smoke):
  // when the persistent BottomTabBar is rendered for this request, the
  // footer's link `<nav>` (CGU / Privacy / Cookies / FAQ / Cookie
  // Preferences) is fully redundant with the More sheet — the visitor
  // sees the same five entries twice on mobile. Hide the nav on the
  // mobile breakpoint when the bar will mount; keep it on desktop
  // (≥ md, where the bar is `md:hidden`). Anonymous mobile visitors
  // and authenticated visitors on excluded routes (/login, /signup,
  // /onboarding) keep the full footer because no bar competes.
  const bottomTabBarMounted = await shouldMountBottomTabBar();
  const footerNavClass = bottomTabBarMounted
    ? 'hidden flex-wrap gap-4 text-sm md:flex'
    : 'flex flex-wrap gap-4 text-sm';

  return (
    <footer className="border-border bg-card border-t">
      {/*
       * PR-BETA-6 Hotfix Option A v3 (THI-277, 2026-05-25): when the
       * persistent BottomTabBar is rendered for an authenticated mobile
       * visitor (cf. `[locale]/layout.tsx`), it occupies `h-12` plus the
       * iPhone safe-area-inset-bottom at the foot of the viewport. The
       * footer's bottom links — including the `<CookiePreferencesLink />`
       * required by GDPR art. 7(3) — would otherwise hide behind the bar
       * on `/faq`, `/legal/*`, `/glossaire`. Reserve enough room for the
       * bar (~3.5rem = 56px ≥ h-12) plus the safe-area inset on mobile;
       * restore the original `pb-10` (40px) on `md:` where the bar is
       * `md:hidden` and would never overlap.
       */}
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 pt-10 pb-[calc(env(safe-area-inset-bottom)+3.5rem)] md:flex-row md:items-center md:px-6 md:pb-10">
        <div className="flex items-center gap-2">
          <BrandHomeLink ariaLabel={tCommon('homeAria')} logoClassName="h-7 w-auto" />
          <span className="text-muted-foreground text-sm">
            {t('copyrightNotice', { year: new Date().getFullYear() })}
          </span>
        </div>
        <nav
          aria-label={tCommon('nav.footerLabel')}
          data-testid="footer-nav"
          className={footerNavClass}
        >
          <Link href="/legal/cgu" className="text-muted-foreground hover:underline">
            {t('cgu')}
          </Link>
          <Link href="/legal/privacy" className="text-muted-foreground hover:underline">
            {t('privacy')}
          </Link>
          <Link href="/legal/cookies" className="text-muted-foreground hover:underline">
            {t('cookies')}
          </Link>
          <Link href="/faq" className="text-muted-foreground hover:underline">
            {t('faq')}
          </Link>
          <CookiePreferencesLink />
        </nav>
      </div>
    </footer>
  );
}
