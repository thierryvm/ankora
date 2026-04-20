import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';

import { getNonce } from '@/lib/security/nonce';
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

import '../globals.css';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

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
      images: [{ url: '/brand/logo.svg', width: 280, height: 64, alt: SITE.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${SITE.name} — ${tagline}`,
      description,
      creator: SITE.twitter,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
    icons: {
      icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
      apple: [{ url: '/apple-icon.svg' }],
    },
    manifest: '/manifest.webmanifest',
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

  const nonce = await getNonce();

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      {...(dataTheme ? { 'data-theme': dataTheme } : {})}
    >
      <script
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){var m=window.matchMedia('(prefers-color-scheme: dark)').matches;t=m?'dark':'light';}if(t==='dark')document.documentElement.setAttribute('data-theme','dark');else document.documentElement.removeAttribute('data-theme');}catch(e){}})();`,
        }}
      />
      <body className={`${inter.variable} font-sans antialiased`}>
        <a
          href="#main"
          className="focus:bg-primary focus:text-primary-foreground focus:ring-ring sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:shadow-lg focus:ring-2 focus:outline-none"
        >
          {t('a11y.skipToMain')}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <ConsentBanner />
          <Toaster />
          <ServiceWorkerRegister />
          <JsonLd data={organizationJsonLd} />
          <Analytics />
          <SpeedInsights />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
