import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildCanonicalUrl } from '@/lib/glossary';

const QUESTION_KEYS = [
  'bankConnection',
  'dataLocation',
  'smoothing',
  'deletion',
  'export',
  'advice',
  'ai',
  'sharing',
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  // `params`, not `getLocale()`: the latter works only because the locale
  // layout happens to call `cookies()` for the theme, which forces dynamic
  // rendering. Reading the segment directly removes that hidden coupling and
  // matches how the glossary pages already do it.
  const { locale } = await params;
  const t = await getTranslations('faq');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    // Locale-aware: when a segment declares `alternates`, Next REPLACES the
    // parent's value instead of recomputing it per locale. Hardcoding '/faq'
    // made /en/faq canonicalise to the French page, contradicting the hreflang
    // Link header emitted for that same URL.
    alternates: { canonical: buildCanonicalUrl('/faq', locale) },
  };
}

export default async function FaqPage() {
  const t = await getTranslations('faq');

  const questions = QUESTION_KEYS.map((key) => ({
    key,
    q: t(`items.${key}.q`),
    a: t(`items.${key}.a`),
  }));

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <>
      <Header variant="marketing" />
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <header>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title')}</h1>
          <p className="text-muted-foreground mt-3">{t('subtitle')}</p>
        </header>

        <dl className="mt-10 space-y-8">
          {questions.map((item) => (
            <div key={item.key} className="border-border border-t pt-6 first:border-t-0 first:pt-0">
              <dt className="text-foreground text-lg font-semibold md:text-xl">{item.q}</dt>
              <dd className="text-muted-foreground mt-2 leading-relaxed">{item.a}</dd>
            </div>
          ))}
        </dl>

        <JsonLd data={faqJsonLd} />
      </main>
      <Footer />
    </>
  );
}
