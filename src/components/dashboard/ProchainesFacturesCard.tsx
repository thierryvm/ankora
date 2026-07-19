import Decimal from 'decimal.js';
import { AlertTriangle, ArrowRight, Bookmark, Calendar, Check } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { currentPeriodDueDate, nextUnpaidDueDate } from '@/lib/domain/charges';
import type { Charge } from '@/lib/domain/types';
import type { Locale } from '@/i18n/routing';
import { formatCurrency, formatDate } from '@/lib/i18n/formatters';
import { paymentKey, type PaymentLedger } from '@/lib/domain/cockpit';

type Props = {
  charges: readonly Charge[];
  payments: PaymentLedger;
  /** "Today" in ISO `YYYY-MM-DD` (Europe/Brussels, computed upstream). */
  todayIso: string;
  locale: Locale;
  /**
   * Bills due LAST month that were never ticked (the per-period ledger resets
   * naturally on month rollover, hiding them). Non-empty `labels` renders the
   * "forgotten bills" alert NAMING the bills so the user checks they were
   * actually paid. Single object so labels can never appear without their
   * month (Sourcery #230). Computed upstream via `unpaidChargesForPeriod`
   * on the previous period's ledger; `monthLabel` is the localized previous
   * month (e.g. « juin »).
   */
  forgotten?: {
    labels: readonly string[];
    monthLabel: string;
    /** `YYYY-MM` of the previous period — links the alert to the month-history view. */
    periodParam: string;
  };
};

type Row = Readonly<{
  charge: Charge;
  dueDateIso: string;
  daysUntilDue: number;
  isOverdue: boolean;
}>;

/**
 * Dashboard bills card, reworked for THI-329 PR-C (@thierry verbatim P5).
 * Two sections replace the former J-7/J-14/J-30 bucket fragmentation:
 *
 *  1. « Ce mois-ci » — the month's UNPAID bills (anchored via
 *     `currentPeriodDueDate`, so a passed-but-unpaid bill shows as overdue
 *     instead of rolling forward), sorted by date, capped at 5 rows (his
 *     explicit ask), headed by the live "reste à payer" amount — the SAME
 *     definition as the charges-page banner (cross-page coherence). All
 *     paid → success state.
 *  2. « À surveiller » — ONLY the bills he flagged (`is_watched`) that are
 *     not already listed above, each with its real next unpaid occurrence.
 *     Replaces the rejected automatic "Mois prochain" bucket.
 *
 * a11y/THI-348: the old `text-danger on bg-danger/15` chips and
 * `text-brand-700` info tone failed WCAG AA on the dark card. Overdue is now
 * a white-on-solid-danger badge (4.84:1 both themes, pattern validated on the
 * charges page) and day chips are neutral surface tokens.
 */
export async function ProchainesFacturesCard({
  charges,
  payments,
  todayIso,
  locale,
  forgotten,
}: Props) {
  const t = await getTranslations('dashboard.upcomingBills');

  const [yearStr, monthStr] = todayIso.split('-');
  const period = { year: Number(yearStr), month: Number(monthStr) };

  const isPaidThisPeriod = (c: Charge): boolean =>
    payments.get(paymentKey(c.id, period.year, period.month)) === true;

  // Section 1 — unpaid bills due this month, anchored to the current period.
  const thisMonthRows: Row[] = charges
    .filter((c) => c.isActive && c.paymentMonths.includes(period.month) && !isPaidThisPeriod(c))
    .flatMap((charge) => {
      const due = currentPeriodDueDate(charge, period, todayIso, false);
      if (!due) return [];
      return [
        {
          charge,
          dueDateIso: due.dueDateIso,
          daysUntilDue: diffInDays(todayIso, due.dueDateIso),
          isOverdue: due.status === 'overdue',
        },
      ];
    })
    .sort((a, b) => (a.dueDateIso < b.dueDateIso ? -1 : a.dueDateIso > b.dueDateIso ? 1 : 0));

  const dueThisMonthCount = charges.filter(
    (c) => c.isActive && c.paymentMonths.includes(period.month),
  ).length;
  const remainingThisMonth = thisMonthRows.reduce(
    (acc, row) => acc.plus(row.charge.amount),
    new Decimal(0),
  );
  const visibleThisMonth = thisMonthRows.slice(0, 5);

  // Section 2 — flagged bills not already shown above, with their real next
  // unpaid occurrence (skips paid, surfaces overdue).
  const watchedRows: Row[] = charges
    .filter((c) => c.isActive && c.isWatched === true && !c.paymentMonths.includes(period.month))
    .flatMap((charge) => {
      const due = nextUnpaidDueDate(charge, payments, todayIso);
      if (!due) return [];
      return [
        {
          charge,
          dueDateIso: due.dueDateIso,
          daysUntilDue: diffInDays(todayIso, due.dueDateIso),
          isOverdue: due.isOverdue,
        },
      ];
    })
    .sort((a, b) => (a.dueDateIso < b.dueDateIso ? -1 : a.dueDateIso > b.dueDateIso ? 1 : 0));

  const hasAnyWatched = charges.some((c) => c.isActive && c.isWatched === true);
  const hasAnyDue = dueThisMonthCount > 0;
  const isEmpty = charges.filter((c) => c.isActive).length === 0;

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
          className="text-brand-text hover:text-brand-text-strong focus-visible:ring-brand-600 inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
          <div className="flex flex-col gap-6">
            {/* Forgotten-bills alert — factual, calm, FSMA-safe. The copy text
                stays `text-foreground` (AA both themes); the warning tint is
                decorative only (same dark-safety rule as the overdue badge). */}
            {forgotten && forgotten.labels.length > 0 && (
              <div
                className="border-warning/40 bg-warning/10 text-foreground flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm"
                data-testid="prochaines-factures-forgotten"
              >
                <AlertTriangle
                  aria-hidden
                  className="text-warning mt-0.5 h-4 w-4 shrink-0"
                  strokeWidth={2}
                />
                <span className="min-w-0">
                  {t('forgottenAlert', {
                    count: forgotten.labels.length,
                    month: forgotten.monthLabel,
                    labels: forgotten.labels.join(', '),
                  })}{' '}
                  <Link
                    href={{ pathname: '/app/charges', query: { period: forgotten.periodParam } }}
                    className="text-brand-text hover:text-brand-text-strong font-medium underline underline-offset-2"
                    data-testid="prochaines-factures-forgotten-link"
                  >
                    {t('forgottenSee', { month: forgotten.monthLabel })}
                  </Link>
                </span>
              </div>
            )}
            {/* ── Ce mois-ci ─────────────────────────────────────────── */}
            <section aria-label={t('thisMonth')} data-testid="prochaines-factures-this-month">
              <header className="mb-1 flex items-baseline justify-between gap-3">
                <h3 className="text-foreground flex items-baseline gap-2 text-sm font-semibold">
                  {t('thisMonth')}
                  {hasAnyDue && (
                    <span className="text-muted-foreground text-xs font-medium">
                      {t('itemCount', { count: thisMonthRows.length })}
                    </span>
                  )}
                </h3>
                {thisMonthRows.length > 0 && (
                  <p className="shrink-0 text-right">
                    <span className="text-muted-foreground mr-1.5 text-xs">
                      {t('remainingLabel')}
                    </span>
                    <span
                      className="text-foreground text-sm font-bold tabular-nums"
                      data-testid="prochaines-factures-remaining"
                    >
                      {formatCurrency(remainingThisMonth, locale)}
                    </span>
                  </p>
                )}
              </header>
              {thisMonthRows.length === 0 ? (
                <p
                  className="text-brand-text flex items-center gap-1.5 py-2 text-sm font-medium"
                  data-testid="prochaines-factures-all-paid"
                >
                  <Check aria-hidden className="h-4 w-4" strokeWidth={3} />
                  {t('thisMonthEmpty')}
                </p>
              ) : (
                <>
                  <p className="text-muted-foreground mb-2 text-xs">{t('thisMonthHint')}</p>
                  <BillList rows={visibleThisMonth} locale={locale} t={t} />
                </>
              )}
            </section>

            {/* ── À surveiller ───────────────────────────────────────── */}
            {watchedRows.length > 0 ? (
              <section aria-label={t('watched')} data-testid="prochaines-factures-watched">
                <header className="mb-1 flex items-baseline gap-2">
                  <h3 className="text-foreground flex items-center gap-1.5 text-sm font-semibold">
                    <Bookmark aria-hidden className="h-4 w-4" strokeWidth={1.5} />
                    {t('watched')}
                    <span className="text-muted-foreground text-xs font-medium">
                      {t('itemCount', { count: watchedRows.length })}
                    </span>
                  </h3>
                </header>
                <p className="text-muted-foreground mb-2 text-xs">{t('watchedHint')}</p>
                <BillList rows={watchedRows} locale={locale} t={t} />
              </section>
            ) : (
              !hasAnyWatched && (
                <p
                  className="text-muted-foreground text-xs"
                  data-testid="prochaines-factures-watched-hint"
                >
                  {t('watchedEmptyHint')}
                </p>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BillList({
  rows,
  locale,
  t,
}: {
  rows: readonly Row[];
  locale: Locale;
  t: Awaited<ReturnType<typeof getTranslations<'dashboard.upcomingBills'>>>;
}) {
  return (
    <ul className="divide-border/60 divide-y overflow-hidden rounded-md border">
      {rows.map((row) => (
        <li
          key={`${row.charge.id}-${row.dueDateIso}`}
          className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2"
          data-testid={`prochaines-factures-row-${row.charge.id}`}
        >
          <div className="min-w-0">
            <p className="text-foreground flex items-center gap-2 truncate text-sm font-medium">
              <span className="truncate">{row.charge.label}</span>
              {row.isOverdue && (
                <span
                  className="bg-danger shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-white"
                  data-testid={`prochaines-factures-overdue-${row.charge.id}`}
                >
                  {t('buckets.overdue')}
                </span>
              )}
            </p>
            <p className="text-muted-foreground text-xs">
              {formatDate(row.dueDateIso, locale, 'medium')}
            </p>
          </div>
          <span className="bg-surface-muted text-muted-foreground inline-flex min-w-24 justify-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums">
            {row.daysUntilDue < 0
              ? t('daysOverdue', { days: Math.abs(row.daysUntilDue) })
              : row.daysUntilDue === 0
                ? t('dueToday')
                : t('daysUntil', { days: row.daysUntilDue })}
          </span>
          <span className="text-foreground min-w-18 text-right text-sm font-semibold tabular-nums">
            {formatCurrency(row.charge.amount, locale)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Calendar-day difference between two ISO dates, UTC-anchored (no DST drift). */
function diffInDays(fromIso: string, toIso: string): number {
  const utc = (iso: string): number => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(toIso) - utc(fromIso)) / 86_400_000);
}
