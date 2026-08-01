'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CloudOff, DatabaseZap } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { AUTH_BACKEND_UNAVAILABLE_DIGEST } from '@/lib/auth/auth-error';
import { DATA_READ_UNAVAILABLE_DIGEST } from '@/lib/data/read-failure';

/**
 * Digest → (namespace, icon). Order is irrelevant, exhaustiveness is not: an
 * unknown digest MUST fall through to `errors.boundary`, because dressing an
 * unrecognised bug up as "temporarily unavailable" hides it exactly as badly as
 * calling an outage a crash.
 */
const DEGRADED = {
  [AUTH_BACKEND_UNAVAILABLE_DIGEST]: { ns: 'errors.unavailable', Icon: CloudOff },
  [DATA_READ_UNAVAILABLE_DIGEST]: { ns: 'errors.dataUnavailable', Icon: DatabaseZap },
} as const;

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
 *
 * `errors.unavailable.*` is deliberately NOT mirrored there: it is only ever
 * reachable from `requireUser()`, which runs inside `[locale]` — never above it.
 * global-error.tsx would show it to nobody.
 *
 * Three outcomes, and the distinctions are the point:
 *
 *   - Supabase auth is briefly unreachable. Nothing is broken, nothing is lost,
 *     the session is still valid — so say that, and offer a retry. Rendering
 *     "Quelque chose s'est cassé" here would be a lie that costs trust, and the
 *     alternative the codebase used to pick — quietly signing the visitor out —
 *     was worse still.
 *   - A read that a guard depends on failed. Same shape, different promise: the
 *     session is fine, it is the data that could not be loaded, and nothing was
 *     modified. Before this existed the app answered that case by routing the
 *     user to onboarding, i.e. by implying their workspace no longer existed.
 *   - Anything else: a genuine defect, and the honest wording is the generic one.
 *
 * They are told apart by `digest`, the only field React lets through from a
 * server error to a client boundary (messages, names and stacks are stripped in
 * production on purpose).
 */
export default function ErrorBoundary({ error, reset }: ErrorProps) {
  const degraded = error.digest ? DEGRADED[error.digest as keyof typeof DEGRADED] : undefined;
  const t = useTranslations(degraded?.ns ?? 'errors.boundary');

  useEffect(() => {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[error-boundary] caught', { digest: error.digest });
    }
  }, [error.digest]);

  const Icon = degraded?.Icon ?? AlertTriangle;

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
          <Icon className="h-8 w-8" />
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
