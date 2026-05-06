import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AlertCircle } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('errors.notFound');
  return {
    title: t('title'),
    robots: { index: false, follow: false },
  };
}

export default async function NotFound() {
  const t = await getTranslations('errors.notFound');

  return (
    <main className="bg-background flex min-h-screen items-center justify-center px-4 py-16">
      <div className="mx-auto max-w-md text-center">
        <div
          aria-hidden
          className="bg-brand-100 text-brand-700 mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-full"
        >
          <AlertCircle className="h-8 w-8" />
        </div>
        <p className="text-brand-700 font-mono text-sm font-medium tracking-widest uppercase">
          404
        </p>
        <h1
          className="text-foreground mt-3 text-4xl font-bold tracking-tight md:text-5xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {t('title')}
        </h1>
        <p className="text-muted-foreground mt-4 text-base leading-relaxed">{t('description')}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/">{t('ctaHome')}</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/app">{t('ctaCockpit')}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
