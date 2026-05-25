import { headers } from 'next/headers';

import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BrandHomeLink } from '@/components/brand/BrandHomeLink';
import { Button } from '@/components/ui/button';
import { isAdmin } from '@/lib/auth/is-admin';
import { getOptionalUser } from '@/lib/auth/require-user';
import { routing } from '@/i18n/routing';
import { isExcludedRoute, stripLocalePrefix } from '@/components/layout/bottom-tab-bar.routes';
import { HeaderNav } from './HeaderNav';

type HeaderProps = {
  variant?: 'marketing' | 'app';
  // Optional override. When omitted on the marketing variant, the Header
  // auto-detects the session via `getOptionalUser` so every public page
  // (FAQ, glossaire, legal/*, landing fallbacks) reflects the visitor's
  // auth state without having to thread the prop through 6 call-sites.
  // The app/layout still passes `isAuthenticated` explicitly to avoid a
  // duplicate Supabase round-trip behind `requireUser`.
  isAuthenticated?: boolean;
};

export async function Header({ variant = 'marketing', isAuthenticated }: HeaderProps) {
  const t = await getTranslations('common');

  const resolvedAuth =
    isAuthenticated ?? (variant === 'marketing' ? !!(await getOptionalUser()) : false);

  // PR-SEC-ADMIN — conditional admin link in app variant. `isAdmin()` reads
  // session + ANKORA_ADMIN_USER_IDS server-side; returns false for any
  // non-admin or unauthenticated visitor (fail-closed). Skipped for
  // marketing variant since marketing pages are public.
  // PR-UX-1 — value is reused as the `isAdmin` prop on `HeaderNav` so the
  // mobile cockpit drawer mirrors the desktop admin link (parity, single
  // server round-trip).
  const showAdminLink = variant === 'app' && (await isAdmin());

  // PR-BETA-6 hotfix #3 (THI-277, 2026-05-25) — duplicate-nav fix.
  //
  // When the persistent BottomTabBar will be rendered for this request
  // (cf. `[locale]/layout.tsx` mount gate), the mobile hamburger trigger
  // becomes a duplicate nav surface on `/faq`, `/glossaire`, `/legal/*`:
  // the visitor sees BOTH the marketing burger top-right AND the bottom
  // tab bar — a 2026 mobile-first anti-pattern (Apple HIG single
  // navigation surface).
  //
  // We mirror the exact same server-side condition as the bar mount
  // (`isAuthenticated && !isExcludedRoute(unprefixedPathname)`) so the
  // two surfaces are mutually exclusive. Anonymous visitors keep the
  // marketing burger (no bar to compete with). Authenticated visitors
  // on excluded routes (`/`, `/login`, `/signup`, etc.) also keep the
  // burger because no bar will render.
  const requestHeaders = await headers();
  const rawPathname = requestHeaders.get('x-pathname') ?? '/';
  const unprefixedPathname = stripLocalePrefix(rawPathname, routing.locales);
  const hideMobileTrigger = resolvedAuth && !isExcludedRoute(unprefixedPathname);

  return (
    // PR-D5 mobile-iOS: extend the sticky header below the iPhone notch in
    // standalone PWA mode. `viewport-fit=cover` (layout.tsx) enables the
    // safe-area env vars; `pt-[env(safe-area-inset-top)]` pushes the content
    // row below the status bar without disturbing browser layout (where the
    // inset reports 0).
    <header className="border-border bg-background/80 sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] backdrop-blur">
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
            {/* PR-UX-1 — `/#features` previously pointed at an id that never
                existed in the landing DOM (Principles section uses
                `id="principles"`). Aligned across Header, HeaderNav drawer,
                MktNav, and Feature CTA so a single anchor is canonical. */}
            <Link
              href="/#principles"
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
                  {/* Subtle marker — signals "private zone" without screaming.
                      `bg-amber-700` (#b45309): ≈ 4.46:1 on white (--color-card
                      light) and ≈ 3.32:1 on navy (--color-card dark) per
                      WebAIM, both pass WCAG SC 1.4.11 Non-text Contrast 3:1.
                      Bumped from amber-600 (#d97706 ≈ 2.91:1 on white — fails
                      AA in light mode). Kept distinct from `--color-warning`
                      token (still amber-600 elsewhere @cowork 2026-04-25);
                      this marker uses the deeper shade only because it
                      doubles as the *only* visual indicator of the private
                      zone. Mirrored in HeaderNav.tsx drawer (PR-UX-1). */}
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-1.5 rounded-full bg-amber-700"
                  />
                </Link>
              </Button>
            )}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-1 md:gap-2">
          {variant === 'marketing' && !resolvedAuth && (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">{t('nav.login')}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">{t('nav.signup')}</Link>
              </Button>
            </>
          )}
          {variant === 'marketing' && resolvedAuth && (
            <Button asChild size="sm">
              <Link href="/app">{t('nav.myCockpit')}</Link>
            </Button>
          )}

          <HeaderNav
            variant={variant}
            isAuthenticated={resolvedAuth}
            isAdmin={showAdminLink}
            hideMobileTrigger={hideMobileTrigger}
          />
        </div>
      </div>
    </header>
  );
}
