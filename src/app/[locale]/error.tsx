'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * NOTE: the `errors.boundary.*` keys read from `messages/*.json` are
 * mirrored as a hardcoded fallback inside `src/app/global-error.tsx`,
 * which runs at the App Router root and cannot reach next-intl. Any
 * wording change here MUST be mirrored in global-error.tsx (and vice
 * versa) to keep both surfaces consistent.
 */
export default function ErrorBoundary({ error, reset }: ErrorProps) {
  const t = useTranslations('errors.boundary');

  useEffect(() => {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[error-boundary] caught', { digest: error.digest });
    }
  }, [error.digest]);

  return (
    <main
      role="alert"
      className="bg-background flex min-h-dvh items-center justify-center px-4 py-16"
    >
      <div className="mx-auto max-w-md text-center">
        <div
          aria-hidden
          className="bg-warning/10 text-warning mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-full"
        >
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h1 className="text-foreground font-display text-4xl font-bold tracking-tight md:text-5xl">
          {t('title')}
        </h1>
        <p className="text-muted-foreground mt-4 text-base leading-relaxed">{t('description')}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button onClick={reset} size="lg">
            {t('ctaRetry')}
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/">{t('ctaHome')}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
