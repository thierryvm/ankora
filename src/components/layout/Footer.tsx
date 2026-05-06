import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { BrandHomeLink } from '@/components/brand/BrandHomeLink';
import { CookiePreferencesLink } from '@/components/layout/CookiePreferencesLink';

export async function Footer() {
  const t = await getTranslations('footer');
  const tCommon = await getTranslations('common');

  return (
    <footer className="border-border bg-card border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-10 md:flex-row md:items-center md:px-6">
        <div className="flex items-center gap-2">
          <BrandHomeLink ariaLabel={tCommon('homeAria')} logoClassName="h-7 w-auto" />
          <span className="text-muted-foreground text-sm">
            {t('copyrightNotice', { year: new Date().getFullYear() })}
          </span>
        </div>
        <nav aria-label={tCommon('nav.footerLabel')} className="flex flex-wrap gap-4 text-sm">
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
