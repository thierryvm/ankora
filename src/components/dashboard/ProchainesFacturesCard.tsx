import Decimal from 'decimal.js';
import { AlertTriangle, ArrowRight, Bookmark, Calendar, Check } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { currentPeriodDueDate, nextUnpaidDueDate } from '@/lib/domain/charges';
import { resteAPayerCeMois } from '@/lib/domain/obligations';
import type { MonthObligation } from '@/lib/domain/obligations';
import type { Charge } from '@/lib/domain/types';
import type { Locale } from '@/i18n/routing';
import { formatCurrency, formatDate } from '@/lib/i18n/formatters';
import { paymentKey, type PaymentLedger } from '@/lib/domain/cockpit';

type Props = {
  charges: readonly Charge[];
  payments: PaymentLedger;
  /**
   * EVERY obligation falling due this month, both families, as built by
   * `obligationsDuMois()` upstream — the money side of this card.
   *
   * `charges` still drives the ROWS (a row needs the `Charge` for its due date
   * and its watched flag); `obligations` drives the TOTAL. They are not
   * redundant: `thisMonthRows` additionally drops charges whose
   * `currentPeriodDueDate` is null, so the headline can legitimately exceed the
   * sum of the visible rows — already true today because of the 5-row cap.
   *
   * Both are anchored on the same Europe/Brussels clock: this card derives its
   * period from `todayIso`, the list is built on `snapshot.currentPeriod`, and
   * `src/lib/data/month-situation.ts` already guards that pair against drift.
   */
  obligations: readonly MonthObligation[];
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
 *     explicit ask), headed by the live "reste à payer" amount. All paid →
 *     success state.
 *
 * ## What "reste à payer" counts, and why the comment used to lie (#349)
 *
 * It counts EVERY obligation still unticked this month — bills AND commitment
 * instalments — because that is what @thierry means by the words: "ce qu'il
 * reste à payer en termes de factures, crédits, engagements". Measured
 * 2026-08-10: the card showed 969,21 € while 1 369,21 € was still to leave the
 * account, a 29 % under-statement on the screen where the month is decided.
 *
 * The lines above USED TO claim "the SAME definition as the charges-page
 * banner (cross-page coherence)" while summing bills only. That claim is why
 * the drift survived: a property asserted in a comment, verified by nothing.
 *
 * The definition is now shared, the implementations are NOT. This card calls
 * `resteAPayerCeMois()` on a server-built list; `ChargesClient` recomputes the
 * same concept client-side over `number`s and its optimistic paid sets, because
 * it must update the instant a checkbox is hit. Two implementations of one
 * definition — held together by
 * `src/components/dashboard/__tests__/ProchainesFacturesCard.test.tsx`
 * (« #349, le total couvre les deux familles »), not by this sentence.
 *
 * The rows stay bills-only on purpose (@thierry, 2026-08-10): the 400 € of
 * instalments are already itemised by `EngagementsCard`, mounted just above on
 * the same screen. Listing them here too would render the same lines twice.
 * The « dont … » line under the total links there, so the figure opens onto its
 * parts (règle 10) without duplicating them.
 *
 * `Decimal` crosses no RSC boundary here — this is a Server Component, and
 * `MonthObligation.amountDue` is formatted before render.
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
  obligations,
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

  // ONE list, ONE total (`du-mois.ts` §"never two independently computed
  // totals"). Summing `thisMonthRows` here is what produced #349: it could only
  // ever see bills.
  const remainingThisMonth = resteAPayerCeMois(obligations);
  const remainingCommitments = resteAPayerCeMois(
    obligations.filter((o) => o.source === 'commitment'),
  );
  /**
   * Gates the whole "this month" block. It reads `obligations`, NOT
   * `thisMonthRows` — the rows are bills-only, so a month whose bills are all
   * ticked while an instalment is not would have rendered « Tout est payé ce
   * mois » with 400 € about to leave. Today the card under-states; that version
   * would have asserted. Caught by `plan-reviewer` before any code was written.
   */
  const hasUnpaidThisMonth = obligations.some((o) => !o.isPaid);
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
  // An account with no active charge but a commitment instalment due used to
  // short-circuit to « Aucune charge active pour le moment » while the money
  // left anyway. The card is empty only when NOTHING is due, either family.
  const isEmpty = charges.filter((c) => c.isActive).length === 0 && obligations.length === 0;

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
          className="text-brand-text hover:text-brand-text-strong focus-visible:ring-brand-600 -my-1 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
                  {/* Counted on the ROWS, never on `obligations`: the key says
                      « facture » and the rows are bills, so the chip can never
                      contradict its own wording — « 0 factures » next to a
                      commitment-only month would. */}
                  {thisMonthRows.length > 0 && (
                    <span className="text-muted-foreground text-xs font-medium">
                      {t('itemCount', { count: thisMonthRows.length })}
                    </span>
                  )}
                </h3>
                {hasUnpaidThisMonth && (
                  <div className="shrink-0 text-right">
                    <p>
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
                    {/* Règle 10 — the total opens onto its parts. The bills are
                        listed below; the instalments are itemised by
                        `EngagementsCard` on this same screen, so this line
                        points there instead of repeating them. */}
                    {remainingCommitments.gt(0) && (
                      <Link
                        href="/app/commitments"
                        className="text-muted-foreground hover:text-brand-text focus-visible:ring-brand-600 inline-block rounded text-xs underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
                        data-testid="prochaines-factures-remaining-commitments"
                      >
                        {t('remainingCommitments', {
                          amount: formatCurrency(remainingCommitments, locale),
                        })}
                      </Link>
                    )}
                  </div>
                )}
              </header>
              {!hasUnpaidThisMonth ? (
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
                  {/* A month can have something left to pay and no bill row —
                      every bill ticked, an instalment not. The total above
                      still says so; the list simply has nothing to show. */}
                  {thisMonthRows.length > 0 && (
                    <BillList rows={visibleThisMonth} locale={locale} t={t} />
                  )}
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
