import Decimal from 'decimal.js';
import { AlertCircle, ArrowRight, Calendar, CalendarClock, Clock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getUpcomingCharges, type UpcomingByBucket, type UpcomingItem } from '@/lib/domain/charges';
import type { Charge } from '@/lib/domain/types';
import type { Locale } from '@/i18n/routing';
import { formatCurrency, formatDate } from '@/lib/i18n/formatters';
import type { PaymentLedger } from '@/lib/domain/cockpit';

type Props = {
  charges: readonly Charge[];
  payments: PaymentLedger;
  /** "Today" in ISO `YYYY-MM-DD` (Europe/Brussels, computed upstream). */
  todayIso: string;
  locale: Locale;
};

/**
 * Section #5 du dashboard cockpit v3 (THI-192) — Prochaines factures.
 *
 * Renders three growing windows (J-7 / J-14 / J-30) of upcoming charges,
 * plus a hidden bucket for overdue-unpaid bills. Math is delegated to the
 * pure `getUpcomingCharges()` helper (`src/lib/domain/charges/upcoming.ts`).
 *
 * Pattern cloned from `ProvisionHealthGaugeCard` (section #2): Server
 * Component, zero hydration cost, `ui/Card` wrapper, Lucide icons, semantic
 * design tokens (`success` / `warning` / `danger`). The atoms-vs-ui migration
 * (post-THI-189) is intentionally out of scope here — every dashboard card
 * still wraps in `ui/Card`.
 *
 * Acceptance criteria per Linear THI-192:
 *  - Buckets J-7 / J-14 / J-30 + overdue separately surfaced
 *  - Per-bucket total amount due (couverture vs dû is already covered by
 *    section #2 Santé Provisions — keeping this card DRY)
 *  - Tap → `/app/charges` via an explicit "Voir toutes →" link in the header
 *    (a11y-safe; avoids the click conflict a card-level wrapper would
 *    introduce with internal chips/links)
 *  - Empty state when no charge falls within the 30-day horizon
 *  - Cron-aware date math via `nextDueDateForCharge` (which the helper uses)
 */
export async function ProchainesFacturesCard({ charges, payments, todayIso, locale }: Props) {
  const t = await getTranslations('dashboard.upcomingBills');

  const result = getUpcomingCharges({
    charges,
    payments,
    todayIso,
  });

  const isEmpty =
    result.overdue.length === 0 &&
    result.j7.length === 0 &&
    result.j14.length === 0 &&
    result.j30.length === 0;

  return (
    <Card data-testid="prochaines-factures-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
            <Calendar aria-hidden strokeWidth={1.5} className="h-5 w-5" />
            {t('title')}
          </CardTitle>
        </div>
        <Link
          href="/app/charges"
          className="text-brand-700 hover:text-brand-800 focus-visible:ring-brand-600 inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          data-testid="prochaines-factures-link-all"
        >
          {t('viewAll')}
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p
            className="text-muted-foreground text-sm leading-relaxed"
            data-testid="prochaines-factures-empty"
          >
            {t('empty')}
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            <Bucket
              bucket="overdue"
              items={result.overdue}
              tone="danger"
              icon={AlertCircle}
              label={t('buckets.overdue')}
              locale={locale}
              t={t}
            />
            <Bucket
              bucket="j7"
              items={result.j7}
              tone="warning"
              icon={Clock}
              label={t('buckets.j7')}
              locale={locale}
              t={t}
            />
            <Bucket
              bucket="j14"
              items={result.j14}
              tone="info"
              icon={CalendarClock}
              label={t('buckets.j14')}
              locale={locale}
              t={t}
            />
            <Bucket
              bucket="j30"
              items={result.j30}
              tone="success"
              icon={Calendar}
              label={t('buckets.j30')}
              locale={locale}
              t={t}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type BucketTone = 'danger' | 'warning' | 'info' | 'success';
type BucketKey = keyof UpcomingByBucket;
type LucideIcon = typeof AlertCircle;

const TONE_CLASSES: Record<BucketTone, { text: string; bg: string; chip: string }> = {
  danger: {
    text: 'text-danger',
    bg: 'bg-danger/10',
    chip: 'bg-danger/15 text-danger',
  },
  warning: {
    text: 'text-warning',
    bg: 'bg-warning/10',
    chip: 'bg-warning/15 text-warning',
  },
  info: {
    text: 'text-brand-700',
    bg: 'bg-brand-100/40',
    chip: 'bg-brand-100 text-brand-800',
  },
  success: {
    text: 'text-success',
    bg: 'bg-success/10',
    chip: 'bg-success/15 text-success',
  },
};

function Bucket({
  bucket,
  items,
  tone,
  icon: Icon,
  label,
  locale,
  t,
}: {
  bucket: BucketKey;
  items: readonly UpcomingItem[];
  tone: BucketTone;
  icon: LucideIcon;
  label: string;
  locale: Locale;
  t: Awaited<ReturnType<typeof getTranslations<'dashboard.upcomingBills'>>>;
}) {
  if (items.length === 0) return null;

  const classes = TONE_CLASSES[tone];
  const total = items.reduce((acc, item) => acc.plus(item.charge.amount), new Decimal(0));

  return (
    <section aria-label={label} data-testid={`prochaines-factures-bucket-${bucket}`}>
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className={`flex items-center gap-2 text-xs font-semibold uppercase ${classes.text}`}>
          <Icon aria-hidden strokeWidth={1.5} className="h-4 w-4" />
          {label}
          <span className="text-muted-foreground ml-1 text-[10px] font-medium normal-case">
            {t('itemCount', { count: items.length })}
          </span>
        </h3>
        <p className={`text-xs font-semibold tabular-nums ${classes.text}`}>
          {formatCurrency(total, locale)}
        </p>
      </header>
      {/*
       * PR-BETA-CLEANUP (THI-279, 2026-05-25): switched the row layout
       * from `flex items-center justify-between` to a 3-column grid so
       * the day-count chip and the amount line up vertically across
       * every row. With the old flex layout, both the chip and the
       * amount were `shrink-0` siblings of the `min-w-0` label block,
       * so their X position drifted by the width of the surrounding
       * content (long label vs short label, "In 365 days" vs "Today",
       * "€9,999.00" vs "€12.50"). Smoke iPhone @thierry 2026-05-25
       * showed visible mis-alignment on the cockpit /app "this week
       * 15 bills" list. Fixed columns + min-w on chip + right-aligned
       * amount lock the visual rhythm regardless of content width.
       */}
      <ul className="divide-border divide-y rounded-md border">
        {items.map((item) => (
          <li
            key={`${item.charge.id}-${item.dueDateIso}`}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2"
            data-testid={`prochaines-factures-row-${item.charge.id}`}
          >
            <div className="min-w-0">
              <p className="text-foreground truncate text-sm font-medium">{item.charge.label}</p>
              <p className="text-muted-foreground text-xs">
                {formatDate(item.dueDateIso, locale, 'medium')}
              </p>
            </div>
            <span
              className={`inline-flex min-w-24 justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${classes.chip}`}
            >
              {item.daysUntilDue < 0
                ? t('daysOverdue', { days: Math.abs(item.daysUntilDue) })
                : item.daysUntilDue === 0
                  ? t('dueToday')
                  : t('daysUntil', { days: item.daysUntilDue })}
            </span>
            <span className="text-foreground min-w-18 text-right text-sm font-semibold tabular-nums">
              {formatCurrency(item.charge.amount, locale)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
