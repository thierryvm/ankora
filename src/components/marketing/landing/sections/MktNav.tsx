import { getTranslations } from 'next-intl/server';

import { AnkoraLogo } from '@/components/brand/AnkoraLogo';
import { HeaderNav } from '@/components/layout/HeaderNav';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

import { ArrowRight } from '../icons';

/**
 * Marketing navigation bar for the public landing page.
 *
 * Mirrors `Landing.jsx` cc-design `<MktNav>` — sticky top, backdrop blur,
 * logo + 5 nav links (lg+) + Login + Try-free CTAs. Mobile breakpoint
 * collapses the link row and exposes the existing `<HeaderNav variant="marketing">`
 * drawer for navigation parity with the rest of the marketing surfaces.
 *
 * NOT used outside the public landing — other public pages (FAQ, glossaire,
 * legal/*) keep `<Header />` so this component can iterate freely without
 * affecting them. The two coexist by design (cf. PR-3c-2 Q4 arbitrage).
 *
 * The links are placeholders pointing at hash anchors that will exist once
 * the matching sections are added in PR-3c-2 (`#simulator` arrives in
 * PR-3c-3 with the WhatIfDemo). External `/pricing`, `/security`, `/journal`
 * routes are out of scope — kept as anchor `#` until those pages exist,
 * which avoids a broken-link regression.
 */
export async function MktNav() {
  const t = await getTranslations('landing.mktnav');
  const tCommon = await getTranslations('common');

  // `disabled` flags links to pages that don't exist yet (issues #79 + #80
  // tracked for post-PR-3c). They render with aria-disabled + cursor-not-allowed
  // so assistive tech and pointer users get clear "not available" feedback.
  const links = [
    { key: 'product', href: '#principles', disabled: false },
    { key: 'simulator', href: '#simulator', disabled: false },
    { key: 'pricing', href: '#pricing', disabled: false },
    { key: 'security', href: '#', disabled: true },
    { key: 'journal', href: '#', disabled: true },
  ] as const;

  return (
    <header className="border-border bg-background/70 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
        <Link
          href="/"
          aria-label={tCommon('homeAria')}
          className="focus-visible:ring-brand-600 flex shrink-0 items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <AnkoraLogo className="h-8 w-auto" />
        </Link>

        <nav aria-label={tCommon('nav.mainLabel')} className="hidden items-center gap-7 lg:flex">
          {links.map((link) =>
            link.disabled ? (
              <span
                key={link.key}
                aria-disabled="true"
                className="text-muted cursor-not-allowed rounded-md text-sm font-medium"
              >
                {t(`links.${link.key}`)}
              </span>
            ) : (
              <a
                key={link.key}
                href={link.href}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-brand-600 rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                {t(`links.${link.key}`)}
              </a>
            ),
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/login">{t('ctaLogin')}</Link>
          </Button>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/signup">
              {t('ctaSignup')}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>

          <HeaderNav variant="marketing" />
        </div>
      </div>
    </header>
  );
}
