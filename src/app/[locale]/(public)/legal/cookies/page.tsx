import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Prose, ProseMeta } from '@/components/layout/Prose';

const LAST_UPDATED = '16 avril 2026';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.cookies');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: { index: false, follow: true },
    alternates: { canonical: '/legal/cookies' },
  };
}

export default async function CookiesPage() {
  const t = await getTranslations('legal.cookies');
  const tLegal = await getTranslations('legal');

  const code = (c: React.ReactNode) => <code>{c}</code>;
  const strong = (c: React.ReactNode) => <strong>{c}</strong>;

  return (
    <>
      <Header variant="marketing" />
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <Prose>
          <h1>{t('title')}</h1>
          <ProseMeta>{tLegal('lastUpdatedLine', { date: LAST_UPDATED })}</ProseMeta>

          <h2>{t('categoriesHeading')}</h2>

          <h3>{t('essentialHeading')}</h3>
          <p>{t('essentialBody')}</p>
          <ul>
            <li>{t.rich('essentialItem1', { code })}</li>
            <li>{t.rich('essentialItem2', { code })}</li>
          </ul>

          <h3>{t('analyticsHeading')}</h3>
          <p>{t('analyticsBody1')}</p>
          <p>{t('analyticsBody2')}</p>

          <h3>{t('marketingHeading')}</h3>
          <p>{t('marketingBody')}</p>

          <h2>{t('manageHeading')}</h2>
          <p>{t.rich('manageBody1', { b: strong })}</p>
          <p>{t('manageBody2')}</p>

          <h2>{t('lifetimeHeading')}</h2>
          <ul>
            <li>{t('lifetimeItem1')}</li>
            <li>{t('lifetimeItem2')}</li>
            <li>{t('lifetimeItem3')}</li>
          </ul>
        </Prose>
      </main>
      <Footer />
    </>
  );
}
