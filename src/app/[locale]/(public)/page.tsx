import type { Metadata, ResolvingMetadata } from 'next';
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
import { Principles } from '@/components/marketing/landing/sections/Principles';
import { WhatIfDemo } from '@/components/marketing/landing/sections/WhatIfDemo';

type LocaleParams = { params: Promise<{ locale: string }> };

export async function generateMetadata(
  { params }: LocaleParams,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { locale } = await params;
  // The home page carries the landing thesis (`landing.meta.*`, PR L3);
  // `common.tagline`/`common.description` stay the reference for the REST of
  // the site (root layout, opengraph-image, manifest — untouched).
  const t = await getTranslations({ locale: locale as Locale, namespace: 'landing.meta' });
  const title = t('title');
  const description = t('description');
  // og/twitter titles do NOT receive the layout's `title.template` — the
  // brand is added by hand, or the shared card would carry no brand at all.
  const socialTitle = `${SITE.name} — ${title}`;
  // The file-convention social image (src/app/[locale]/opengraph-image.tsx)
  // does NOT survive a page-level `openGraph` declaration: measured on the
  // local prod build — 0 og:image occurrences — despite the docs giving
  // file-based metadata higher priority. Read the resolved parent and carry
  // its images forward explicitly.
  const resolvedParent = await parent;
  const parentOgImages = resolvedParent.openGraph?.images ?? [];
  // The resolved parent's twitter.images is EMPTY here (no twitter-image.tsx
  // file exists — twitter only falls back to the og image when the page
  // declares no `twitter` object at all, measured: 0 twitter:image after the
  // first fix). Reuse the og images' urls so the card keeps its picture.
  const parentTwitterImages =
    resolvedParent.twitter?.images && resolvedParent.twitter.images.length > 0
      ? resolvedParent.twitter.images
      : parentOgImages.map((img) => (typeof img === 'object' && 'url' in img ? img.url : img));
  return {
    // No brand prefix in the key: the layout's `title.template` appends
    // « · Ankora ». (The previous `${SITE.name} — …` value collided with the
    // template and rendered a doubled brand — measured on production.)
    title,
    description,
    openGraph: {
      // A page-level `openGraph` REPLACES the layout's object — Next.js
      // metadata merging is per exported field, not deep. Declare the FULL
      // object (copying the layout's invariant fields), otherwise og:type,
      // og:locale, og:url and og:site_name silently vanish from the most
      // shared page of the site. Divergence risk with the layout copy is
      // accepted for L3 (the root layout is out of this PR's perimeter) and
      // filed with the vocabulary-reconciliation pass.
      type: 'website',
      locale,
      url: SITE.url,
      siteName: SITE.name,
      title: socialTitle,
      description,
      images: parentOgImages,
    },
    twitter: {
      // Same replacement rule as openGraph — redeclared in full so og and
      // twitter never diverge on the same URL.
      card: 'summary_large_image',
      title: socialTitle,
      description,
      creator: SITE.twitter,
      images: parentTwitterImages,
    },
  };
}

export default async function HomePage({ params }: LocaleParams) {
  const { locale } = await params;
  const nonce = await getNonce();
  const t = await getTranslations('landing');

  const softwareJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    // Same source as the <meta name="description"> of this page — the
    // JSON-LD describes the home, so it follows the landing thesis copy.
    description: t('meta.description'),
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

      {/* Marketing paper scope (ADR-039). The wrapper lives HERE, in the page,
          because the page re-renders on every client navigation — a layout
          would freeze the surface decision (root layouts are not re-rendered).
          It must stay a DIRECT child of <body>: globals.css gives
          `body > .mkt-paper` the flex-link role that `body > main` plays on
          every unwrapped page (footer at the bottom of short pages). The scope
          paints its own paper background — no background utility here. */}
      <div className="mkt-paper">
        <MktNav />

        <main id="main" tabIndex={-1}>
          <Hero />
          <Principles />
          <Feature />
          <WhatIfDemo />
          <FAQ />
          <FooterCTA />
        </main>

        <MktFooter />
      </div>
    </>
  );
}
