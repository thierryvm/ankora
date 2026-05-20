import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';

import './globals.css';

/**
 * Root-level branded 404. Lives at the App Router root rather than under
 * `[locale]/` because next-intl's `localePrefix: 'as-needed'` setup means a
 * fully unresolved path (no locale, no matching route) cannot reliably land
 * on the locale segment — Next.js renders the root not-found and requires
 * `<html>`/`<body>` here. The root `app/layout.tsx` is intentionally a
 * passthrough (the real shell lives in `[locale]/layout.tsx`), so this
 * component carries its own document tags.
 *
 * Copy is bilingual FR/EN, picked from the `NEXT_LOCALE` cookie set by
 * next-intl, with a safe fallback to FR (defaultLocale).
 */

const COPY = {
  fr: {
    label: '404',
    title: 'Page introuvable',
    description: "Cette page n'existe pas ou a été déplacée. Reviens à ton cockpit pour continuer.",
    ctaHome: "Retour à l'accueil",
    ctaCockpit: 'Aller à mon cockpit',
  },
  en: {
    label: '404',
    title: 'Page not found',
    description:
      "This page doesn't exist or has been moved. Head back to your cockpit to continue.",
    ctaHome: 'Back to home',
    ctaCockpit: 'Go to my cockpit',
  },
} as const;

type LocaleKey = keyof typeof COPY;

async function pickLocale(): Promise<LocaleKey> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
  if (cookieLocale?.toLowerCase().startsWith('en')) return 'en';
  if (cookieLocale && cookieLocale !== '') return 'fr';

  const requestHeaders = await headers();
  const accept = requestHeaders.get('accept-language') ?? '';
  if (accept.toLowerCase().startsWith('en')) return 'en';
  return 'fr';
}

export async function generateMetadata(): Promise<Metadata> {
  const copy = COPY[await pickLocale()];
  return {
    title: copy.title,
    robots: { index: false, follow: false },
  };
}

export default async function NotFound() {
  const locale = await pickLocale();
  const copy = COPY[locale];
  const cockpitHref = locale === 'en' ? '/en/app' : '/app';

  return (
    <html lang={locale} className="overflow-x-clip">
      <body className="bg-background font-sans antialiased">
        <main className="flex min-h-screen items-center justify-center px-4 py-16">
          <div className="mx-auto max-w-md text-center">
            <p className="text-brand-700 font-mono text-sm font-medium tracking-widest uppercase">
              {copy.label}
            </p>
            <h1 className="text-foreground font-display mt-3 text-4xl font-bold tracking-tight md:text-5xl">
              {copy.title}
            </h1>
            <p className="text-muted-foreground mt-4 text-base leading-relaxed">
              {copy.description}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {/*
                eslint-disable-next-line @next/next/no-html-link-for-pages --
                Intentional: this not-found.tsx lives at the App Router root
                with its own <html>/<body>. Using next/link from a fully
                self-contained document fights the locale-prefix middleware
                and re-introduces a runtime dependency we just escaped from
                by living outside `[locale]/`. A native anchor + full reload
                is the predictable behaviour we want for a 404.
              */}
              <a
                href="/"
                className="bg-brand-700 hover:bg-brand-600 inline-flex h-12 items-center justify-center rounded-lg px-6 text-base font-medium text-white shadow-sm transition-colors"
              >
                {copy.ctaHome}
              </a>
              <a
                href={cockpitHref}
                className="border-border bg-card text-foreground hover:border-brand-500 hover:text-brand-700 inline-flex h-12 items-center justify-center rounded-lg border px-6 text-base font-medium shadow-sm transition-colors"
              >
                {copy.ctaCockpit}
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
