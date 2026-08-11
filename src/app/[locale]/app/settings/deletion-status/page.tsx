import type { Metadata } from 'next';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Locale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/require-user';
import { formatDate, formatDateTime } from '@/lib/i18n/formatters';
import { createClient } from '@/lib/supabase/server';
import { CancelDeletionButton } from './CancelDeletionButton';
import { RetryDeletionForm } from './RetryDeletionForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.deletionStatus');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default async function DeletionStatusPage() {
  const t = await getTranslations('app.deletionStatus');
  const locale = (await getLocale()) as Locale;
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('deletion_requests')
    .select('requested_at, scheduled_for, status, cancelled_at, retried_at')
    .eq('user_id', user.id)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return redirect({ href: '/app/settings', locale: await getLocale() });

  const scheduled = new Date(data.scheduled_for);
  const now = new Date();
  const daysLeft = Math.max(
    0,
    Math.ceil((scheduled.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const requestedAt = formatDateTime(data.requested_at, locale, {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  const scheduledAt = formatDate(scheduled, locale);

  // `processing` used to fall through to the `completed` branch — an erasure in
  // flight was announced as already done, in red.
  //
  // A previous version of this comment claimed the explicit listing made the
  // next status added to the CHECK constraint "show up as a missing case". That
  // was FALSE, and worth recording rather than silently deleting: `status` is
  // typed `string` (supabase/types.ts), not a union, and a ternary chain has no
  // exhaustiveness check. A fifth status would have rendered « Complétée », in
  // red — telling someone their account is erased when it is not. A comment
  // asserting a guarantee that does not exist is the same defect as the
  // countdown nothing was executing.
  //
  // A lookup with an explicit fallback makes the absence of a case visible
  // instead of dressing it up as a terminal state.
  const STATUS_PRESENTATION = {
    pending: { color: 'text-warning', label: 'statusPending' },
    processing: { color: 'text-warning', label: 'statusProcessing' },
    // A state of PENDING NON-COMPLIANCE, not a resolved problem: quarantine
    // does not stop the art. 12(3) clock. Hence `text-danger`, and a screen
    // that offers a way out rather than an apology.
    failed: { color: 'text-danger', label: 'statusFailed' },
    cancelled: { color: 'text-success', label: 'statusCancelled' },
    // Unreachable in practice (ADR-024 D1: the row cascades away with the
    // account, so nothing ever writes it), kept because the CHECK accepts it.
    completed: { color: 'text-danger', label: 'statusCompleted' },
  } as const;

  const presentation = STATUS_PRESENTATION[data.status as keyof typeof STATUS_PRESENTATION] ?? null;
  const statusColor = presentation?.color ?? 'text-muted-foreground';
  const statusLabel = presentation ? t(presentation.label) : t('statusUnknown');

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </header>

      <Card className="border-danger/40">
        <CardHeader>
          <CardTitle>
            {t('statusLabel')} <span className={statusColor}>{statusLabel}</span>
          </CardTitle>
          <CardDescription>{t('requestedOn', { date: requestedAt })}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data.status === 'pending' && (
            <>
              <dl className="grid gap-4 md:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground text-xs">{t('scheduledFor')}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">{scheduledAt}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">{t('daysLeft')}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">
                    {t('daysCount', { days: daysLeft })}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">{t('auditLogs')}</dt>
                  <dd className="mt-1 text-sm">{t('auditLogsValue')}</dd>
                </div>
              </dl>
              {/* The relaunch date belongs HERE, in the `pending` branch, and
                  putting it in the `failed` one would be the natural mistake:
                  *retry* moves the row back to `pending`, so a screen that only
                  learned about `failed` would write `retried_at` and NEVER show
                  it — a column added to be read that nothing forces to appear,
                  which is the mute mechanism this whole change is about.

                  A DATE, not a state: a date can be checked, a state is merely
                  believed. */}
              {data.retried_at && (
                <p className="text-sm">
                  {t('retriedOn', { date: formatDate(data.retried_at, locale) })}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <CancelDeletionButton />
                <Button asChild variant="outline">
                  <Link href="/app/settings">{t('backToSettings')}</Link>
                </Button>
              </div>
            </>
          )}

          {/* Quarantine. The cancel button is BACK — the reason it is hidden
              during `processing` is that a run HOLDS the row, and that reason
              disappears here: a `failed` row is held by nobody (invariant n° 3
              of the migration, `claimed_at is null`).

              Two actions, opposite consequences, deliberately asymmetric in
              cost: cancelling is one click, relaunching asks for the typed
              address. And the copy says what is true — no notification was
              sent, because the application sends none (ADR-023). */}
          {data.status === 'failed' && (
            <>
              <p className="text-sm">{t('failedBody')}</p>
              <div className="flex flex-wrap gap-2">
                <CancelDeletionButton />
                <Button asChild variant="outline">
                  <Link href="/app/settings">{t('backToSettings')}</Link>
                </Button>
              </div>
              <RetryDeletionForm email={user.email ?? ''} />
            </>
          )}

          {/* No cancel button here, deliberately: a run already owns this
              request and the GoTrue call may already have gone out. Offering
              a control that cannot work is the same inexact statement the
              countdown itself used to make. */}
          {data.status === 'processing' && (
            <>
              <p className="text-sm">{t('processingBody')}</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href="/app/settings">{t('backToSettings')}</Link>
                </Button>
              </div>
            </>
          )}

          {data.status === 'cancelled' && (
            <p className="text-sm">
              {data.cancelled_at
                ? t('cancelledOn', {
                    date: formatDate(data.cancelled_at, locale),
                  })
                : t('cancelledNoDate')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
