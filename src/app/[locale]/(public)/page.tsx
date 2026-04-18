import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Script from 'next/script';
import { getTranslations } from 'next-intl/server';
import { ArrowRight, Shield, TrendingUp, Wallet } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { SITE } from '@/lib/site';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.description,
};

const FEATURE_KEYS = ['smoothing', 'assistant', 'secure'] as const;
const FEATURE_ICONS = { smoothing: TrendingUp, assistant: Wallet, secure: Shield } as const;
const STEP_KEYS = ['one', 'two', 'three'] as const;
const FAQ_KEYS = ['advice', 'storage', 'sharing'] as const;

export default async function HomePage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const t = await getTranslations('landing');
  const tCommon = await getTranslations('common');

  const softwareJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    description: SITE.description,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web, iOS, Android',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    inLanguage: 'fr-BE',
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

      <Header />

      <main id="main">
        <section className="mx-auto max-w-6xl px-4 pt-20 pb-16 md:px-6 md:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-(--color-border) bg-(--color-card) px-3 py-1 text-xs font-medium text-(--color-brand-700)">
              <span className="inline-block h-2 w-2 rounded-full bg-(--color-brand-500)" />
              {t('badge')}
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-balance text-(--color-foreground) md:text-6xl">
              {tCommon('tagline')}.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-(--color-muted-foreground)">
              {tCommon('description')}
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/signup">
                  {t('heroCtaPrimary')}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="#features">{t('heroCtaSecondary')}</Link>
              </Button>
            </div>
          </div>
        </section>

        <section
          id="features"
          aria-labelledby="features-heading"
          className="mx-auto max-w-6xl px-4 py-16 md:px-6"
        >
          <h2 id="features-heading" className="mb-12 text-center text-3xl font-bold tracking-tight">
            {t('featuresHeading')}
          </h2>
          <ul className="grid gap-6 md:grid-cols-3">
            {FEATURE_KEYS.map((key) => {
              const Icon = FEATURE_ICONS[key];
              return (
                <li
                  key={key}
                  className="rounded-xl border border-(--color-border) bg-(--color-card) p-6"
                >
                  <Icon
                    className="mb-4 h-8 w-8 text-(--color-brand-700)"
                    aria-hidden
                    strokeWidth={1.75}
                  />
                  <h3 className="mb-2 text-lg font-semibold">{t(`features.${key}.title`)}</h3>
                  <p className="text-sm text-(--color-muted-foreground)">
                    {t(`features.${key}.body`)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="how-heading" className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <h2 id="how-heading" className="mb-12 text-center text-3xl font-bold tracking-tight">
            {t('howHeading')}
          </h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {STEP_KEYS.map((key) => (
              <li
                key={key}
                className="rounded-xl border border-(--color-border) bg-(--color-card) p-6"
              >
                <div className="mb-4 font-mono text-sm font-bold text-(--color-accent-600)">
                  {t(`steps.${key}.n`)}
                </div>
                <h3 className="mb-2 text-lg font-semibold">{t(`steps.${key}.title`)}</h3>
                <p className="text-sm text-(--color-muted-foreground)">{t(`steps.${key}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>

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
              <div
                key={key}
                className="rounded-xl border border-(--color-border) bg-(--color-card) p-6"
              >
                <dt className="mb-2 font-semibold">{t(`faq.${key}.q`)}</dt>
                <dd className="text-sm text-(--color-muted-foreground)">{t(`faq.${key}.a`)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <Footer />
    </>
  );
}
