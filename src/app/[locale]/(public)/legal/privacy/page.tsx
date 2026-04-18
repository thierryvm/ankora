import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Prose, ProseMeta } from '@/components/layout/Prose';

const LAST_UPDATED = '16 avril 2026';
const VERSION = '1.0.0';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.privacy');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: '/legal/privacy' },
  };
}

export default async function PrivacyPage() {
  const t = await getTranslations('legal.privacy');
  const tLegal = await getTranslations('legal');

  const strong = (c: React.ReactNode) => <strong>{c}</strong>;
  const mail = (c: React.ReactNode) => <a href="mailto:privacy@ankora.eu">{c}</a>;
  const apd = (c: React.ReactNode) => (
    <a href="https://www.autoriteprotectiondonnees.be/" rel="noopener">
      {c}
    </a>
  );
  const link = (c: React.ReactNode) => <Link href="/legal/cookies">{c}</Link>;

  return (
    <>
      <Header variant="marketing" />
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <Prose>
          <h1>{t('title')}</h1>
          <ProseMeta>{tLegal('versionLine', { version: VERSION, date: LAST_UPDATED })}</ProseMeta>

          <h2>{t('s1.heading')}</h2>
          <p>{t.rich('s1.body', { mail })}</p>

          <h2>{t('s2.heading')}</h2>
          <p>{t('s2.intro')}</p>
          <ul>
            <li>{t.rich('s2.item1', { b: strong })}</li>
            <li>{t.rich('s2.item2', { b: strong })}</li>
            <li>{t.rich('s2.item3', { b: strong })}</li>
            <li>{t.rich('s2.item4', { b: strong })}</li>
          </ul>
          <p>{t('s2.outro')}</p>

          <h2>{t('s3.heading')}</h2>
          <ul>
            <li>{t.rich('s3.item1', { b: strong })}</li>
            <li>{t.rich('s3.item2', { b: strong })}</li>
            <li>{t.rich('s3.item3', { b: strong })}</li>
            <li>{t.rich('s3.item4', { b: strong })}</li>
          </ul>

          <h2>{t('s4.heading')}</h2>
          <ul>
            <li>{t.rich('s4.item1', { b: strong })}</li>
            <li>{t.rich('s4.item2', { b: strong })}</li>
            <li>{t.rich('s4.item3', { b: strong })}</li>
          </ul>
          <p>{t('s4.outro')}</p>

          <h2>{t('s5.heading')}</h2>
          <ul>
            <li>{t('s5.item1')}</li>
            <li>{t('s5.item2')}</li>
            <li>{t('s5.item3')}</li>
          </ul>

          <h2>{t('s6.heading')}</h2>
          <ul>
            <li>{t.rich('s6.item1', { b: strong })}</li>
            <li>{t.rich('s6.item2', { b: strong })}</li>
            <li>{t.rich('s6.item3', { b: strong })}</li>
            <li>{t.rich('s6.item4', { b: strong })}</li>
            <li>{t.rich('s6.item5', { b: strong })}</li>
            <li>{t.rich('s6.item6', { b: strong, apd })}</li>
          </ul>

          <h2>{t('s7.heading')}</h2>
          <ul>
            <li>{t('s7.item1')}</li>
            <li>{t('s7.item2')}</li>
            <li>{t('s7.item3')}</li>
            <li>{t('s7.item4')}</li>
          </ul>

          <h2>{t('s8.heading')}</h2>
          <p>{t.rich('s8.body', { link })}</p>

          <h2>{t('s9.heading')}</h2>
          <p>{t('s9.body')}</p>
        </Prose>
      </main>
      <Footer />
    </>
  );
}
