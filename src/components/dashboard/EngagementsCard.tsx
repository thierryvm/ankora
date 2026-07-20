import { ArrowRight, Landmark } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CommitmentRow } from '@/lib/data/commitments';
import {
  endPeriod,
  installmentsPaid,
  isDueInPeriod,
  installmentAmountOf,
  periodKey,
  remainingBalance,
  type Commitment,
} from '@/lib/domain/commitments';
import type { Locale } from '@/i18n/routing';
import { formatCurrency, formatMonth } from '@/lib/i18n/formatters';

type Props = {
  commitments: readonly CommitmentRow[];
  paidKeysByCommitment: Record<string, string[]>;
  currentPeriod: { year: number; month: number };
  locale: Locale;
};

const toDomain = (c: CommitmentRow): Commitment => ({
  id: c.id,
  kind: c.kind,
  totalAmount: c.totalAmount,
  installmentAmount: c.installmentAmount,
  installmentsTotal: c.installmentsTotal,
  startYear: c.startYear,
  startMonth: c.startMonth,
  paymentDay: c.paymentDay,
  frequency: c.frequency,
  isActive: c.isActive,
});

/**
 * Dashboard « Mes engagements » card (épic Dettes & échéanciers PR-3).
 *
 * Answers one question at a glance: how much do I still owe in total, and what
 * falls due this month? Reads the SAME source as the commitments page
 * (`getCommitmentsWithLedger`) so the two surfaces can never disagree.
 *
 * Rendered only when at least one commitment exists — an empty card would be
 * noise on a cockpit that already has a lot to say.
 */
export async function EngagementsCard({
  commitments,
  paidKeysByCommitment,
  currentPeriod,
  locale,
}: Props) {
  const t = await getTranslations('dashboard.commitments');

  const rows = commitments
    .filter((c) => c.isActive)
    .map((c) => {
      const domain = toDomain(c);
      const paidKeys = new Set(paidKeysByCommitment[c.id] ?? []);
      const paid = installmentsPaid(domain, paidKeys);
      return {
        row: c,
        domain,
        remaining: remainingBalance(domain, paidKeys),
        paid,
        finished: paid >= c.installmentsTotal,
        dueThisMonth: isDueInPeriod(domain, currentPeriod),
        tickedThisMonth: paidKeys.has(periodKey(currentPeriod.year, currentPeriod.month)),
      };
    })
    // A settled commitment stops weighing on the cockpit.
    .filter((r) => !r.finished);

  if (rows.length === 0) return null;

  const totalRemaining = rows.reduce((sum, r) => sum + r.remaining, 0);
  const dueThisMonth = rows.filter((r) => r.dueThisMonth && !r.tickedThisMonth);
  const dueAmount = dueThisMonth.reduce((sum, r) => sum + installmentAmountOf(r.domain), 0);

  return (
    <Card data-testid="engagements-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
          <Landmark aria-hidden strokeWidth={1.5} className="h-5 w-5" />
          {t('title')}
        </CardTitle>
        <Link
          href="/app/commitments"
          className="text-brand-text hover:text-brand-text-strong focus-visible:ring-brand-600 inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          data-testid="engagements-card-link"
        >
          {t('viewAll')}
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            <p className="text-muted-foreground text-xs font-medium">{t('totalRemainingLabel')}</p>
            <p
              className="text-foreground text-xl font-bold tabular-nums"
              data-testid="engagements-total-remaining"
            >
              {formatCurrency(totalRemaining, locale)}
            </p>
          </div>
          {dueThisMonth.length > 0 && (
            <p className="text-right" data-testid="engagements-due-this-month">
              <span className="text-muted-foreground mr-1.5 text-xs">{t('dueThisMonthLabel')}</span>
              <span className="text-foreground text-sm font-semibold tabular-nums">
                {formatCurrency(dueAmount, locale)}
              </span>
            </p>
          )}
        </div>

        <ul className="divide-border/60 divide-y">
          {rows.map(({ row, domain, remaining, paid }) => {
            const end = endPeriod(domain);
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2"
                data-testid={`engagements-row-${row.id}`}
              >
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-medium">{row.label}</p>
                  <p className="text-muted-foreground text-xs">
                    {row.kind === 'one_off'
                      ? `${formatMonth(row.startMonth, locale, 'long')} ${row.startYear}`
                      : t('installmentsLeft', {
                          left: row.installmentsTotal - paid,
                          end: `${formatMonth(end.month, locale, 'long')} ${end.year}`,
                        })}
                  </p>
                </div>
                <span className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
                  {formatCurrency(remaining, locale)}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
