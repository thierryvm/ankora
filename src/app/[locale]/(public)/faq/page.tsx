import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { JsonLd } from '@/components/seo/JsonLd';

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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('faq');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: '/faq' },
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
          <p className="mt-3 text-(--color-muted-foreground)">{t('subtitle')}</p>
        </header>

        <dl className="mt-10 space-y-8">
          {questions.map((item) => (
            <div
              key={item.key}
              className="border-t border-(--color-border) pt-6 first:border-t-0 first:pt-0"
            >
              <dt className="text-lg font-semibold text-(--color-foreground) md:text-xl">
                {item.q}
              </dt>
              <dd className="mt-2 leading-relaxed text-(--color-muted-foreground)">{item.a}</dd>
            </div>
          ))}
        </dl>

        <JsonLd data={faqJsonLd} />
      </main>
      <Footer />
    </>
  );
}
