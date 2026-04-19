import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Prose, ProseMeta } from '@/components/layout/Prose';

const LAST_UPDATED = '16 avril 2026';
const VERSION = '1.0.0';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.cgu');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: { index: false, follow: false },
    alternates: { canonical: '/legal/cgu' },
  };
}

export default async function CguPage() {
  const t = await getTranslations('legal.cgu');
  const tLegal = await getTranslations('legal');

  return (
    <>
      <Header variant="marketing" />
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <Prose>
          <h1>{t('title')}</h1>
          <ProseMeta>{tLegal('versionLine', { version: VERSION, date: LAST_UPDATED })}</ProseMeta>

          <h2>{t('s1.heading')}</h2>
          <p>{t('s1.body')}</p>

          <h2>{t('s2.heading')}</h2>
          <ul>
            <li>{t.rich('s2.item1', { b: (c) => <strong>{c}</strong> })}</li>
            <li>{t.rich('s2.item2', { b: (c) => <strong>{c}</strong> })}</li>
            <li>{t.rich('s2.item3', { b: (c) => <strong>{c}</strong> })}</li>
            <li>{t.rich('s2.item4', { b: (c) => <strong>{c}</strong> })}</li>
          </ul>
          <p>{t('s2.outro')}</p>

          <h2>{t('s3.heading')}</h2>
          <ul>
            <li>{t('s3.item1')}</li>
            <li>{t('s3.item2')}</li>
            <li>{t('s3.item3')}</li>
            <li>{t('s3.item4')}</li>
          </ul>

          <h2>{t('s4.heading')}</h2>
          <p>{t('s4.intro')}</p>
          <ul>
            <li>{t('s4.item1')}</li>
            <li>{t('s4.item2')}</li>
            <li>{t('s4.item3')}</li>
            <li>{t('s4.item4')}</li>
          </ul>

          <h2>{t('s5.heading')}</h2>
          <p>{t('s5.body')}</p>

          <h2>{t('s6.heading')}</h2>
          <p>{t('s6.body')}</p>

          <h2>{t('s7.heading')}</h2>
          <p>{t('s7.body')}</p>

          <h2>{t('s8.heading')}</h2>
          <p>{t('s8.body')}</p>
        </Prose>
      </main>
      <Footer />
    </>
  );
}
