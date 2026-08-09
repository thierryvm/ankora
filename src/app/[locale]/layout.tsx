import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';

import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, setRequestLocale, getTranslations } from 'next-intl/server';

import { SITE } from '@/lib/site';
import { routing, type Locale } from '@/i18n/routing';
import { isIndexableLocale, indexableLanguageAlternates } from '@/lib/seo/indexable-locales';
import { ConsentGatedAnalytics } from '@/components/gdpr/ConsentGatedAnalytics';
import { Toaster } from '@/components/ui/toast';
import { JsonLd } from '@/components/seo/JsonLd';
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister';
import { ThemeBootScript } from '@/components/theme/ThemeBootScript';
import {
  BottomTabBarVisibilityProvider,
  BottomTabBarSlot,
  ConsentBannerSlot,
  UpdateBannerSlot,
} from '@/components/layout/bottom-tab-bar-visibility';
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

  // Source unique partagee avec `sitemap.ts` — cf. `@/lib/seo/indexable-locales`.
  const isIndexable = isIndexableLocale(locale);
  const languageAlternates = indexableLanguageAlternates();

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
      // `follow` reste vrai même quand `index` est faux : on ne veut pas
      // indexer une page française servie sous une URL néerlandaise, mais les
      // liens qu'elle porte mènent vers des pages légitimes.
      index: isIndexable,
      follow: true,
      googleBot: { index: isIndexable, follow: true, 'max-image-preview': 'large' },
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

  // Ce layout est PARTAGÉ : Next ne le re-rend pas lors d'une navigation
  // client. Toute valeur dépendant du chemin y serait donc gelée pour la vie du
  // document — c'est ce qui empêchait la barre d'onglets d'apparaître dans la
  // PWA installée, où l'on démarre toujours sur `/` (une route exclue) et où
  // aucun geste ne recharge un document. Mesuré le 2026-08-05 ; le détail est
  // dans `bottom-tab-bar-visibility.tsx`.
  //
  // Seule la moitié SERVEUR reste ici : « le visiteur est-il authentifié ? »,
  // qui ne change qu'à la connexion ou à la déconnexion — deux transitions qui
  // passent par un `redirect()` de niveau document, donc re-rendent la racine.
  // La moitié qui dépend du chemin est réévaluée côté client à chaque
  // navigation.
  const isAuthenticated = (await getOptionalUser()) !== null;
  // `isAdmin()` reste adossé à la moitié serveur, jamais à la moitié route :
  // l'adosser au chemin ferait payer une résolution de privilège à chaque rendu
  // anonyme de la landing.
  const showAdminEntry = isAuthenticated && (await isAdmin());

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      // PR-QA-1c-1 (4 mai 2026): defensive horizontal overflow guard at the
      // document root. Captured by PR-QA-1b on iPhone SE (375px viewport):
      // body.scrollWidth=330 vs clientWidth=320 — a 10px overflow that
      // turned the landing into a horizontally-pannable surface.
      //
      // The guard is declared TWICE on purpose: here as a Tailwind utility,
      // and again as a naked rule in globals.css. The naked rule exists
      // because this class was observed missing from the production bundle
      // (Tailwind 4 scans className strings; a server-component string can be
      // missed), and it is the one that actually wins — it sits outside any
      // `@layer`, so it outranks every utility.
      //
      // `clip`, never `hidden`, and the difference is load-bearing:
      // `overflow-x: hidden` promotes the other axis to `auto` (CSS Overflow
      // 3), turning <html> and <body> into scroll containers and severing the
      // `position: sticky` chain for every header on the site. That is what
      // happened between 4 May and 10 August 2026. Rationale, measurements
      // and browser-support floor: see the `html` block in globals.css.
      //
      // The comment previously here justified `hidden` by a Playwright WebKit
      // getComputedStyle quirk. That quirk does not reproduce — re-measured
      // 2026-08-09 on WebKit at 390px and 320px.
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
          {/* L'ORDRE DES FRÈRES CI-DESSOUS EST SIGNIFIANT et ne doit pas bouger.
              `navigation-usable-first-visit.spec.ts` mesure par `elementFromPoint`,
              donc par ordre de peinture : deux surfaces `fixed` au même `z-index`
              seraient départagées par le DOM, en silence. C'est pour ça que
              chaque consommateur a son propre emplacement, à sa place d'origine,
              plutôt qu'un parent commun qui déplacerait `Toaster` et
              `ServiceWorkerRegister` par rapport à eux. */}
          <BottomTabBarVisibilityProvider isAuthenticated={isAuthenticated}>
            {children}
            {/* `liftedForBottomBar` : la bannière est `fixed z-50`, la barre
                d'onglets `fixed z-40`. La réserve `--consent-height` posée en
                `padding-bottom` sur `body` ne protège que le contenu DANS le flux ;
                elle n'a jamais déplacé la barre, que la bannière recouvrait donc
                intégralement. Même valeur, même raison que pour la `ScrollToTop`. */}
            <ConsentBannerSlot />
            <Toaster />
            <BottomTabBarSlot isAdmin={showAdminEntry} />
            <ServiceWorkerRegister />
            {/* Même décalage que la bannière de consentement : la barre d'onglets
                est `fixed`, aucune réserve en `padding-bottom` ne la déplace. */}
            <UpdateBannerSlot />
            <JsonLd data={organizationJsonLd} />
            {/* Montage INCONDITIONNEL : le gate decide a l'interieur. Le rendre
                conditionnel reinitialiserait sa `ref` de memoire de chargement. */}
            <ConsentGatedAnalytics />
          </BottomTabBarVisibilityProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
