import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';

import type { SmallCount } from '@/lib/admin/aggregates';
import type { AdminMetrics, SecurityEvent } from '@/lib/admin/metrics';

import { AdminTabs } from './_client/AdminTabs';
import { shownCount, WeeklyBars } from './WeeklyBars';

/**
 * The admin panel, v1 (audit of 1 October 2026, §3.3): four tabs fed by
 * `readAdminMetrics` and nothing else. It receives numbers, week labels and
 * fixed event names — the shape of `AdminMetrics` is what keeps any personal
 * data out of this screen and its HTML.
 *
 * A block that could not be read (`null`) shows « — » in every place a figure
 * would stand, never a zero. Every block says, in one line, where its figure
 * comes from.
 */

const NONE = '—';

/** next-intl keys cannot hold dots: one stable key per security event. */
const SECURITY_KEYS = {
  'auth.mfa_challenge_failed': 'mfaFailed',
  'auth.rate_limited': 'authRateLimited',
  'admin.access.denied': 'adminDenied',
  'admin.access.rate_limited': 'adminRateLimited',
} as const satisfies Record<SecurityEvent, string>;
const SECURITY_ORDER = Object.keys(SECURITY_KEYS) as SecurityEvent[];

function Block({
  title,
  source,
  children,
}: Readonly<{ title: string; source: string; children: React.ReactNode }>) {
  return (
    <section className="border-border bg-card space-y-4 rounded-2xl border p-4 md:p-5">
      <header className="space-y-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-muted-foreground text-xs">{source}</p>
      </header>
      {children}
    </section>
  );
}

function Figure({
  label,
  value,
  alert,
}: Readonly<{ label: string; value: string; alert?: string | false }>) {
  // An alert is said in words (WCAG 1.4.1): a red figure alone is a colour.
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd
        className={`flex items-center gap-2 text-2xl font-semibold tabular-nums ${alert ? 'text-danger' : ''}`}
      >
        {alert ? <span aria-hidden="true" className="bg-danger size-2 rounded-full" /> : null}
        {value}
        {alert ? <span className="sr-only">{alert}</span> : null}
      </dd>
    </div>
  );
}

function Figures({ children }: Readonly<{ children: React.ReactNode }>) {
  return <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">{children}</dl>;
}

export function AdminDashboard({ metrics }: Readonly<{ metrics: AdminMetrics }>) {
  const t = useTranslations('admin');
  const locale = useLocale();
  const masked = t('masked');
  const alertWord = t('alert');
  const alertIf = (on: boolean) => (on ? alertWord : false);
  const show = (value: SmallCount | undefined) =>
    value === undefined ? NONE : shownCount(value, masked);
  const weekFormat = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const formatWeek = (week: string) => weekFormat.format(new Date(`${week}T00:00:00Z`));

  const { users, activity, security, gdpr } = metrics;
  const deletions = gdpr.deletions;
  const consent = gdpr.analyticsConsent;

  const usersPanel = (
    <div className="space-y-4">
      <Block title={t('users.title')} source={t('users.source')}>
        <Figures>
          <Figure label={t('users.total')} value={show(users?.total)} />
          <Figure label={t('users.onboarded')} value={show(users?.onboarded)} />
        </Figures>
      </Block>
      <Block title={t('users.weeklyTitle')} source={t('users.weeklySource')}>
        {users ? (
          <WeeklyBars
            weeks={users.weekly}
            caption={t('users.weeklyTitle')}
            weekHeader={t('users.weekHeader')}
            countHeader={t('users.countHeader')}
            masked={masked}
            formatWeek={formatWeek}
          />
        ) : (
          <p className="text-2xl font-semibold">{NONE}</p>
        )}
      </Block>
    </div>
  );

  const activityPanel = (
    <Block title={t('activity.title')} source={t('activity.source')}>
      <Figures>
        <Figure label={t('activity.day1')} value={show(activity?.day1)} />
        <Figure label={t('activity.days7')} value={show(activity?.days7)} />
        <Figure label={t('activity.days30')} value={show(activity?.days30)} />
      </Figures>
    </Block>
  );

  const securityPanel = (
    <Block title={t('security.title')} source={t('security.source')}>
      <Figures>
        {SECURITY_ORDER.map((event) => {
          const key = SECURITY_KEYS[event];
          const row = security?.find((s) => s.event === event);
          return (
            <Figure
              key={event}
              label={t(`security.events.${key}`)}
              value={show(row?.count)}
              alert={alertIf(typeof row?.count === 'number' ? row.count > 0 : row?.count === '< 5')}
            />
          );
        })}
      </Figures>
    </Block>
  );

  const exact = (value: number | undefined) => (value === undefined ? NONE : String(value));
  const gdprPanel = (
    <div className="space-y-4">
      <Block title={t('gdpr.deletionsTitle')} source={t('gdpr.deletionsSource')}>
        <Figures>
          <Figure
            label={t('gdpr.stuck')}
            value={exact(deletions?.stuck)}
            alert={alertIf((deletions?.stuck ?? 0) > 0)}
          />
          <Figure
            label={t('gdpr.nearBreach')}
            value={exact(deletions?.nearBreach)}
            alert={alertIf((deletions?.nearBreach ?? 0) > 0)}
          />
        </Figures>
        <p className="text-muted-foreground text-xs">{t('gdpr.deletionsHelp')}</p>
      </Block>
      <Block title={t('gdpr.consentTitle')} source={t('gdpr.consentSource')}>
        <Figures>
          <Figure label={t('gdpr.granted')} value={show(consent?.granted)} />
          <Figure label={t('gdpr.refused')} value={show(consent?.refused)} />
          <Figure label={t('gdpr.neverChosen')} value={show(consent?.neverChosen)} />
        </Figures>
      </Block>
      <Block title={t('gdpr.buildTitle')} source={t('gdpr.buildSource')}>
        <p className="font-mono text-lg">{metrics.build}</p>
      </Block>
    </div>
  );

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('intro')}</p>
      </header>
      <AdminTabs
        label={t('tabsLabel')}
        tabs={[
          { id: 'users', label: t('tabs.users'), panel: usersPanel },
          { id: 'activity', label: t('tabs.activity'), panel: activityPanel },
          { id: 'security', label: t('tabs.security'), panel: securityPanel },
          { id: 'gdpr', label: t('tabs.gdpr'), panel: gdprPanel },
        ]}
      />
    </section>
  );
}
