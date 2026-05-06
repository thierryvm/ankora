'use client';

import { useEffect } from 'react';

import './globals.css';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * NOTE: this COPY object MUST stay in sync with `messages/{locale}.json`
 * `errors.boundary.*` keys. global-error.tsx runs at root level, OUTSIDE
 * the `[locale]` route group, so it cannot use next-intl. Any wording
 * change in `messages/*.json` must be mirrored here (and vice versa).
 *
 * Cf. src/app/[locale]/error.tsx for the i18n-driven counterpart.
 */
const COPY = {
  fr: {
    title: "Quelque chose s'est cassé",
    description: "Une erreur inattendue s'est produite. Tes données sont en sécurité.",
    retry: 'Réessayer',
    home: "Retour à l'accueil",
  },
  en: {
    title: 'Something broke',
    description: 'An unexpected error occurred. Your data is safe.',
    retry: 'Try again',
    home: 'Back to home',
  },
} as const;

function pickLocale(): keyof typeof COPY {
  if (typeof document === 'undefined') return 'fr';
  const lang = document.documentElement.lang.toLowerCase();
  if (lang.startsWith('en')) return 'en';
  return 'fr';
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[global-error] caught', { digest: error.digest });
    }
  }, [error.digest]);

  const locale = pickLocale();
  const copy = COPY[locale];

  return (
    <html lang={locale}>
      <body className="bg-background font-sans antialiased">
        <main role="alert" className="flex min-h-screen items-center justify-center px-4 py-16">
          <div className="mx-auto max-w-md text-center">
            <h1
              className="text-foreground text-4xl font-bold tracking-tight md:text-5xl"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {copy.title}
            </h1>
            <p className="text-muted-foreground mt-4 text-base leading-relaxed">
              {copy.description}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                onClick={reset}
                className="bg-brand-700 hover:bg-brand-600 inline-flex h-12 items-center justify-center rounded-lg px-6 text-base font-medium text-white shadow-sm transition-colors"
              >
                {copy.retry}
              </button>
              {/*
                eslint-disable-next-line @next/next/no-html-link-for-pages --
                Intentional: global-error.tsx is the last-resort fallback when
                the entire app shell is broken. A plain anchor triggers a full
                browser navigation that bypasses the (potentially crashed)
                Next.js router. next/link would re-introduce the dependency
                on the very runtime this boundary was caught from.
              */}
              <a
                href="/"
                className="border-border bg-card text-foreground hover:border-brand-500 hover:text-brand-700 inline-flex h-12 items-center justify-center rounded-lg border px-6 text-base font-medium shadow-sm transition-colors"
              >
                {copy.home}
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
