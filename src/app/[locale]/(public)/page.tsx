import type { Metadata } from 'next';
import { getNonce } from '@/lib/security/nonce';
import { getTranslations } from 'next-intl/server';

import type { Locale } from '@/i18n/routing';
import { SITE } from '@/lib/site';
import { FAQ, FAQ_KEYS } from '@/components/marketing/landing/sections/FAQ';
import { Feature } from '@/components/marketing/landing/sections/Feature';
import { FooterCTA } from '@/components/marketing/landing/sections/FooterCTA';
import { Hero } from '@/components/marketing/landing/sections/Hero';
import { MktFooter } from '@/components/marketing/landing/sections/MktFooter';
import { MktNav } from '@/components/marketing/landing/sections/MktNav';
import { Pricing } from '@/components/marketing/landing/sections/Pricing';
import { Principles } from '@/components/marketing/landing/sections/Principles';
import { WhatIfDemo } from '@/components/marketing/landing/sections/WhatIfDemo';

type LocaleParams = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: 'common' });
  return {
    title: `${SITE.name} — ${t('tagline')}`,
    description: t('description'),
  };
}

export default async function HomePage({ params }: LocaleParams) {
  const { locale } = await params;
  const nonce = await getNonce();
  const t = await getTranslations('landing');
  const tCommon = await getTranslations('common');

  const softwareJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    description: tCommon('description'),
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web, iOS, Android',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    inLanguage: locale,
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_KEYS.map((key) => ({
      '@type': 'Question',
      name: t(`faq.${key}.q`),
      acceptedAnswer: { '@type': 'Answer', text: t(`faq.${key}.a`) },
    })),
  };

  // JSON-LD: native <script type="application/ld+json"> rendered server-side
  // (was `next/script` with afterInteractive strategy, which injects post-
  // hydration — invisible to crawlers and to Playwright mobile-safari).
  // Content is `JSON.stringify(...)` of locally-built objects (constants
  // + i18n translations + locale string), no user input — safe.
  // This is the canonical Next.js + React pattern for JSON-LD; see
  // https://nextjs.org/docs/app/guides/json-ld
  const softwareLdHtml = JSON.stringify(softwareJsonLd);
  const faqLdHtml = JSON.stringify(faqJsonLd);

  return (
    <>
      <script
        id="ld-software"
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: softwareLdHtml }}
      />
      <script
        id="ld-faq"
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: faqLdHtml }}
      />

      <MktNav />

      <main id="main" tabIndex={-1}>
        <Hero />
        <Principles />
        <Feature />
        <WhatIfDemo />
        <Pricing />
        <FAQ />
        <FooterCTA />
      </main>

      <MktFooter />
    </>
  );
}
