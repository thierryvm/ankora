import { getTranslations } from 'next-intl/server';

import { AnkoraLogo } from '@/components/brand/AnkoraLogo';
import { HeaderNav } from '@/components/layout/HeaderNav';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { getOptionalUser } from '@/lib/auth/require-user';

import { ArrowRight } from '../icons';

/**
 * Marketing navigation bar for the public landing page.
 *
 * Mirrors `Landing.jsx` cc-design `<MktNav>` — sticky top, backdrop blur,
 * logo + nav links (lg+) + Login + Try-free CTAs. Mobile breakpoint
 * collapses the link row and exposes the existing `<HeaderNav variant="marketing">`
 * drawer for navigation parity with the rest of the marketing surfaces.
 *
 * NOT used outside the public landing — other public pages (FAQ, glossaire,
 * legal/*) keep `<Header />` so this component can iterate freely without
 * affecting them. The two coexist by design (cf. PR-3c-2 Q4 arbitrage).
 *
 * PR-UX-1 (2026-05-18): dropped `security` + `journal` from the main nav
 * — competitor benchmark (Monarch, YNAB, Copilot) confirms neither belongs
 * at top level, and the disabled placeholders were misleading. Kept inside
 * the footer (`footer.security`) where the FSMA/legal footprint lives.
 */
export async function MktNav() {
  const t = await getTranslations('landing.mktnav');
  const tCommon = await getTranslations('common');

  // Resolve session server-side so the marketing CTAs (and the mobile drawer)
  // reflect a logged-in visitor. Without this, a user who lands on `/` from
  // any link still sees "Se connecter" / "Essayer gratuitement", which made
  // them believe their session was lost (it wasn't — `/app` still worked).
  const isAuthenticated = !!(await getOptionalUser());

  const links = [
    { key: 'product', href: '#principles' },
    { key: 'simulator', href: '#simulator' },
    { key: 'pricing', href: '#pricing' },
  ] as const;

  return (
    // PR-D5 mobile-iOS: same safe-area-inset-top handling as `Header.tsx` for
    // PWA standalone parity on iPhone with notch.
    <header className="border-border bg-background/70 sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
        <Link
          href="/"
          aria-label={tCommon('homeAria')}
          className="focus-visible:ring-brand-600 flex shrink-0 items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <AnkoraLogo className="h-8 w-auto" />
        </Link>

        <nav aria-label={tCommon('nav.mainLabel')} className="hidden items-center gap-7 lg:flex">
          {links.map((link) => (
            <a
              key={link.key}
              href={link.href}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-brand-600 rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {t(`links.${link.key}`)}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isAuthenticated ? (
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/app">
                {tCommon('nav.myCockpit')}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login">{t('ctaLogin')}</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/signup">
                  {t('ctaSignup')}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </>
          )}

          <HeaderNav variant="marketing" isAuthenticated={isAuthenticated} />
        </div>
      </div>
    </header>
  );
}
