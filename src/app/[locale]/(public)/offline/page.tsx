import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('offline');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: { index: false, follow: false },
  };
}

export default async function OfflinePage() {
  const t = await getTranslations('offline');
  return (
    <main
      id="main"
      className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-4 py-16 text-center"
    >
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title')}</h1>
      <p className="text-muted-foreground mt-3">{t('message')}</p>
      <Link
        href="/"
        className="bg-brand-700 hover:bg-brand-800 mt-8 rounded-md px-5 py-2.5 text-sm font-medium text-white"
      >
        {t('retry')}
      </Link>
    </main>
  );
}
