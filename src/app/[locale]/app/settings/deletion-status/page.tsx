import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Locale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/require-user';
import { formatDate, formatDateTime } from '@/lib/i18n/formatters';
import { createClient } from '@/lib/supabase/server';
import { CancelDeletionButton } from './CancelDeletionButton';

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
    .select('requested_at, scheduled_for, status, cancelled_at')
    .eq('user_id', user.id)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) redirect('/app/settings');

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

  const statusColor =
    data.status === 'pending'
      ? 'text-warning'
      : data.status === 'cancelled'
        ? 'text-success'
        : 'text-danger';

  const statusLabel =
    data.status === 'pending'
      ? t('statusPending')
      : data.status === 'cancelled'
        ? t('statusCancelled')
        : t('statusCompleted');

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
              <div className="flex flex-wrap gap-2">
                <CancelDeletionButton />
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
