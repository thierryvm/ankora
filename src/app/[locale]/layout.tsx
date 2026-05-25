import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { cookies, headers } from 'next/headers';

import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, setRequestLocale, getTranslations } from 'next-intl/server';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

import { SITE } from '@/lib/site';
import { routing, type Locale } from '@/i18n/routing';
import { ConsentBanner } from '@/components/gdpr/ConsentBanner';
import { Toaster } from '@/components/ui/toast';
import { JsonLd } from '@/components/seo/JsonLd';
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister';
import { ThemeBootScript } from '@/components/theme/ThemeBootScript';
import { BottomTabBar } from '@/components/layout/BottomTabBar';
import { isExcludedRoute, stripLocalePrefix } from '@/components/layout/bottom-tab-bar.routes';
import { getOptionalUser } from '@/lib/auth/require-user';
import { isAdmin } from '@/lib/auth/is-admin';

import '../globals.css';

// Inter is loaded as a self-hosted variable font via `@font-face` in
// `globals.css` and surfaced through the Tailwind v4 `@theme --font-sans`
// token. The `next/font/google` Inter import was dropped on 2026-05-19
// (THI-244 Phase A): it pulled a second copy of Inter from Google Fonts on
// top of the self-hosted `/fonts/Inter-Variable.woff2`, adding ~25 KB of
// duplicate font payload plus a third-party connection and a GDPR exposure
// (Google logs visitor IPs). Single source of truth = the WOFF2 in
// `/public/fonts/` served with a 1-year immutable Cache-Control header.

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

type LocaleParams = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;

  // Locale-aware copy: tagline + description come from messages/<locale>.json
  // (common.tagline / common.description), not from the FR-hardcoded SITE consts.
  const t = await getTranslations({ locale: locale as Locale, namespace: 'common' });
  const tagline = t('tagline');
  const description = t('description');

  const languageAlternates = Object.fromEntries(
    routing.locales.map((l) => [l, l === routing.defaultLocale ? '/' : `/${l}`]),
  );

  return {
    metadataBase: new URL(SITE.url),
    title: {
      default: `${SITE.name} — ${tagline}`,
      template: `%s · ${SITE.name}`,
    },
    description,
    applicationName: SITE.name,
    keywords: [...SITE.keywords],
    authors: [...SITE.authors],
    creator: SITE.authors[0].name,
    publisher: SITE.name,
    formatDetection: { email: false, address: false, telephone: false },
    alternates: {
      canonical: locale === routing.defaultLocale ? '/' : `/${locale}`,
      languages: languageAlternates,
    },
    openGraph: {
      type: 'website',
      locale,
      url: SITE.url,
      siteName: SITE.name,
      title: `${SITE.name} — ${tagline}`,
      description,
      // images intentionally omitted: Next.js auto-discovers
      // src/app/[locale]/opengraph-image.tsx (1200×630 PNG dynamique
      // par locale, généré via next/og ImageResponse).
    },
    twitter: {
      card: 'summary_large_image',
      title: `${SITE.name} — ${tagline}`,
      description,
      creator: SITE.twitter,
      // images: same as openGraph above — auto-discovered by Next.js
      // from src/app/[locale]/twitter-image.tsx if present, falling
      // back to opengraph-image.tsx otherwise.
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
    icons: {
      icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
      // PR-D5 mobile-iOS: iOS only accepts PNG for the home-screen icon.
      // The previous `/apple-icon.svg` reference produced a fallback grey
      // tile after Add-to-Home-Screen. The PNG already exists in `public/icons/`.
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    manifest: '/manifest.webmanifest',
    // PR-D5 mobile-iOS: declare standalone PWA capability so iOS opens the
    // app fullscreen (no Safari chrome) after Add-to-Home-Screen. The
    // `black-translucent` status bar lets the brand teal extend behind it.
    appleWebApp: {
      capable: true,
      title: SITE.name,
      statusBarStyle: 'black-translucent',
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: SITE.themeColor },
    { media: '(prefers-color-scheme: dark)', color: '#0B3C49' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
};

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();
  const t = await getTranslations('common');

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.name,
    url: SITE.url,
    logo: `${SITE.url}/brand/logo.svg`,
    description: t('description'),
  };

  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('theme')?.value;
  const dataTheme = themeCookie === 'dark' ? 'dark' : undefined;

  // PR-BETA-6 Hotfix Option A v3 (THI-277, 2026-05-25) — persistent
  // BottomTabBar mount.
  //
  // The bar is rendered ONCE here at the locale root so it stays mounted
  // across in-app navigation (cockpit → admin → faq → legal …). Two server-
  // side gates decide whether to render:
  //
  //   1. `user` — visitors without a session never see the bar (landing,
  //      anon FAQ/legal/glossary keep their marketing chrome). Fail-soft via
  //      `getOptionalUser()` so transient Supabase blips never 500 the page.
  //   2. `!isExcludedRoute(unprefixedPathname)` — focused full-screen flows
  //      (login/signup/reset-password/onboarding/offline) and the landing
  //      itself never show the bar.
  //
  // The pathname is read from the `x-pathname` request header that
  // `src/proxy.ts` sets BEFORE next-intl runs (cf. proxy JSDoc + PR-SEC-
  // ADMIN P1-A). `stripLocalePrefix` removes the optional `/<locale>/`
  // prefix so the exclusion list works whatever locale the visitor uses.
  const requestHeaders = await headers();
  const rawPathname = requestHeaders.get('x-pathname') ?? '/';
  const unprefixedPathname = stripLocalePrefix(rawPathname, routing.locales);
  const user = await getOptionalUser();
  const showBottomTabBar = !!user && !isExcludedRoute(unprefixedPathname);
  // `isAdmin()` re-runs the Supabase `getUser()` round-trip inside the
  // helper. Cheap (already cached server-side per-request by Supabase)
  // and lets the helper stay self-contained — no need to pipe the user
  // object into a new isAdminFor(user) variant just for this mount site.
  const showAdminEntry = showBottomTabBar && (await isAdmin());

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      // PR-QA-1c-1 (4 mai 2026): defensive horizontal overflow guard at the
      // document root. Captured by PR-QA-1b on iPhone SE (375px viewport):
      // body.scrollWidth=330 vs clientWidth=320 — a 10px overflow that
      // turned the landing into a horizontally-pannable surface. We use
      // `overflow-x-clip` (rather than `overflow-x-clip`) because
      // Playwright WebKit returns `getComputedStyle().overflowX === "visible"`
      // for `clip` despite the rule being applied (apparent emulation
      // quirk), and `hidden` is universally supported.
      className="overflow-x-clip"
      {...(dataTheme ? { 'data-theme': dataTheme } : {})}
    >
      <body className="max-w-full overflow-x-clip font-sans antialiased">
        {/* Theme bootstrap. Runs synchronously before paint to confirm or
            override the SSR `data-theme` (cookie-seeded above) against the
            visitor's localStorage and OS preference. Extracted to a Server
            Component so its `nonce` attribute is preserved by React 19
            streaming. Pre-2026-05-18 the inline script was inlined directly
            between <html> and <body> AND the middleware set `x-nonce` AFTER
            `handleI18nRouting` — Server Components saw `getNonce() ===
            undefined`, the rendered <script> had no nonce, and the strict
            CSP blocked execution. See ThemeBootScript JSDoc + proxy.ts. */}
        <ThemeBootScript />
        <a
          href="#main"
          // PR-D5 a11y: `bg-primary`, `text-primary-foreground`, `ring-ring`
          // are Tailwind-default tokens NOT declared in @theme of globals.css.
          // Switched to Ankora design tokens (brand-700 background, white text,
          // brand-600 ring) so the skip-link respects the actual design system
          // and survives a token rename.
          className="focus:bg-brand-700 focus:ring-brand-600 sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:text-white focus:shadow-lg focus:ring-2 focus:outline-none"
        >
          {t('a11y.skipToMain')}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <ConsentBanner />
          <Toaster />
          {showBottomTabBar && <BottomTabBar isAdmin={showAdminEntry} />}
          <ServiceWorkerRegister />
          <JsonLd data={organizationJsonLd} />
          <Analytics />
          <SpeedInsights />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
