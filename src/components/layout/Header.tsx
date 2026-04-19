import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { AnkoraLogo } from '@/components/brand/AnkoraLogo';
import { Button } from '@/components/ui/button';
import { HeaderNav } from './HeaderNav';

type HeaderProps = {
  variant?: 'marketing' | 'app';
  isAuthenticated?: boolean;
};

export async function Header({ variant = 'marketing', isAuthenticated = false }: HeaderProps) {
  const t = await getTranslations('common');

  return (
    <header className="border-border bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 md:px-6">
        <Link
          href={isAuthenticated ? '/app' : '/'}
          aria-label={t('homeAria')}
          className="focus-visible:ring-brand-600 flex shrink-0 items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <AnkoraLogo className="h-8 w-auto" />
        </Link>

        {variant === 'marketing' ? (
          <nav aria-label={t('nav.mainLabel')} className="hidden items-center gap-1 lg:flex">
            <Link
              href="/#features"
              className="text-muted-foreground hover:text-foreground rounded-md px-3 py-2 text-sm transition-colors"
            >
              {t('nav.features')}
            </Link>
            <Link
              href="/faq"
              className="text-muted-foreground hover:text-foreground rounded-md px-3 py-2 text-sm transition-colors"
            >
              {t('nav.faq')}
            </Link>
          </nav>
        ) : (
          <nav aria-label={t('nav.appLabel')} className="hidden items-center gap-1 lg:flex">
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
          </nav>
        )}

        <div className="ml-auto flex items-center gap-1 md:gap-2">
          {variant === 'marketing' && !isAuthenticated && (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">{t('nav.login')}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">{t('nav.signup')}</Link>
              </Button>
            </>
          )}
          {variant === 'marketing' && isAuthenticated && (
            <Button asChild size="sm">
              <Link href="/app">{t('nav.myCockpit')}</Link>
            </Button>
          )}

          <HeaderNav variant={variant} />
        </div>
      </div>
    </header>
  );
}
