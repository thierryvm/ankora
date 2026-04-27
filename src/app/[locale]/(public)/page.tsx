import type { Metadata } from 'next';
import { getNonce } from '@/lib/security/nonce';
import Script from 'next/script';
import { getTranslations } from 'next-intl/server';

import type { Locale } from '@/i18n/routing';
import { SITE } from '@/lib/site';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/marketing/landing/sections/Hero';
import { MktNav } from '@/components/marketing/landing/sections/MktNav';

type LocaleParams = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: 'common' });
  return {
    title: `${SITE.name} — ${t('tagline')}`,
    description: t('description'),
  };
}

const FAQ_KEYS = ['advice', 'storage', 'sharing'] as const;

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

  return (
    <>
      <Script id="ld-software" type="application/ld+json" nonce={nonce}>
        {JSON.stringify(softwareJsonLd)}
      </Script>
      <Script id="ld-faq" type="application/ld+json" nonce={nonce}>
        {JSON.stringify(faqJsonLd)}
      </Script>

      <MktNav />

      <main id="main" tabIndex={-1}>
        <Hero />

        {/* FAQ — kept inline pour l'instant (L6 PR-3c-2 la refondra avec design tokens
            + repositionnera entre Pricing et FooterCTA). Conserve le JSON-LD FAQPage
            ci-dessus pour SEO/llms.txt. */}
        <section
          id="faq"
          aria-labelledby="faq-heading"
          className="mx-auto max-w-3xl px-4 py-16 md:px-6"
        >
          <h2 id="faq-heading" className="mb-8 text-center text-3xl font-bold tracking-tight">
            {t('faqHeading')}
          </h2>
          <dl className="space-y-4">
            {FAQ_KEYS.map((key) => (
              <div key={key} className="border-border bg-card rounded-xl border p-6">
                <dt className="mb-2 font-semibold">{t(`faq.${key}.q`)}</dt>
                <dd className="text-muted-foreground text-sm">{t(`faq.${key}.a`)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <Footer />
    </>
  );
}
