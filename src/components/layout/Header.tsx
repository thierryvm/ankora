import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { AnkoraLogo } from '@/components/brand/AnkoraLogo';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher';

type HeaderProps = {
  variant?: 'marketing' | 'app';
  isAuthenticated?: boolean;
};

export async function Header({ variant = 'marketing', isAuthenticated = false }: HeaderProps) {
  const t = await getTranslations('common');

  return (
    <header className="sticky top-0 z-40 border-b border-(--color-border) bg-(--color-background)/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link
          href={isAuthenticated ? '/app' : '/'}
          aria-label={t('homeAria')}
          className="flex items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-(--color-brand-600) focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <AnkoraLogo className="h-8 w-auto" />
        </Link>

        {variant === 'marketing' ? (
          <nav aria-label={t('nav.mainLabel')} className="flex items-center gap-1 md:gap-2">
            <Link
              href="/#features"
              className="hidden rounded-md px-3 py-2 text-sm text-(--color-muted-foreground) hover:text-(--color-foreground) md:inline-block"
            >
              {t('nav.features')}
            </Link>
            <Link
              href="/faq"
              className="hidden rounded-md px-3 py-2 text-sm text-(--color-muted-foreground) hover:text-(--color-foreground) md:inline-block"
            >
              {t('nav.faq')}
            </Link>
            <LocaleSwitcher />
            {isAuthenticated ? (
              <Button asChild size="sm">
                <Link href="/app">{t('nav.myCockpit')}</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">{t('nav.login')}</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">{t('nav.signup')}</Link>
                </Button>
              </>
            )}
          </nav>
        ) : (
          <nav aria-label={t('nav.appLabel')} className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/app">{t('nav.dashboard')}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/accounts">{t('nav.accounts')}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/charges">{t('nav.charges')}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/settings">{t('nav.settings')}</Link>
            </Button>
            <LocaleSwitcher />
          </nav>
        )}
      </div>
    </header>
  );
}
