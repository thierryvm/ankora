import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BrandHomeLink } from '@/components/brand/BrandHomeLink';
import { Button } from '@/components/ui/button';
import { isAdmin } from '@/lib/auth/is-admin';
import { HeaderNav } from './HeaderNav';

type HeaderProps = {
  variant?: 'marketing' | 'app';
  isAuthenticated?: boolean;
};

export async function Header({ variant = 'marketing', isAuthenticated = false }: HeaderProps) {
  const t = await getTranslations('common');

  // PR-SEC-ADMIN — conditional admin link in app variant. `isAdmin()` reads
  // session + ANKORA_ADMIN_USER_IDS server-side; returns false for any
  // non-admin or unauthenticated visitor (fail-closed). Skipped for
  // marketing variant since marketing pages are public.
  const showAdminLink = variant === 'app' && (await isAdmin());

  return (
    <header className="border-border bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 md:px-6">
        {/*
         * The logo always points to the public landing (`/`), aligned with
         * MktNav.tsx — clicking it from `/app` is now a deliberate
         * navigation, which avoids the no-op + title-flash described in
         * issue #95. The tactile press animation reinforces the click.
         * Shared with Footer via BrandHomeLink so a11y semantics and focus
         * styling cannot drift between the two surfaces (Sourcery #119).
         */}
        <BrandHomeLink ariaLabel={t('homeAria')} logoClassName="h-8 w-auto" />

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
              <Link href="/app/expenses">{t('nav.expenses')}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/simulator">{t('nav.simulator')}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/settings">{t('nav.settings')}</Link>
            </Button>
            {showAdminLink && (
              <Button asChild variant="ghost" size="sm" aria-label={t('nav.adminAriaLabel')}>
                <Link href="/admin" className="flex items-center gap-1.5">
                  <span>{t('nav.admin')}</span>
                  {/* Subtle marker — signals "private zone" without screaming. */}
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
                  />
                </Link>
              </Button>
            )}
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
