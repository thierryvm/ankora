'use client';

import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import type { Locale } from '@/i18n/routing';
import {
  createCommitmentAction,
  deleteCommitmentAction,
  toggleCommitmentPaymentAction,
} from '@/lib/actions/commitments';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import type { CommitmentRow } from '@/lib/data/commitments';
import {
  endPeriod,
  installmentsPaid,
  isDueInPeriod,
  installmentAmountOf,
  periodKey,
  remainingBalance,
  type Commitment,
  type CommitmentKind,
} from '@/lib/domain/commitments';
import { formatCurrency, formatMonth } from '@/lib/i18n/formatters';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

/** Row shape crossing the RSC boundary (money as plain `number`, never Decimal). */
export type RawCommitment = CommitmentRow;

type Props = {
  commitments: RawCommitment[];
  /** Ledger keys (`${year}-${month}`) per commitment id. */
  paidKeysByCommitment: Record<string, string[]>;
  currentPeriod: { year: number; month: number };
  locale: Locale;
};

const KIND_KEY = {
  debt: 'kinds.debt',
  installment_plan: 'kinds.installmentPlan',
  one_off: 'kinds.oneOff',
} as const;

export function CommitmentsClient({
  commitments,
  paidKeysByCommitment,
  currentPeriod,
  locale,
}: Props) {
  const t = useTranslations('app.commitments');
  const translateError = useActionErrorTranslator();

  const [isPending, startTransition] = useTransition();
  const [showAddForm, setShowAddForm] = useState(false);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<CommitmentKind>('debt');
  const [totalAmount, setTotalAmount] = useState('');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [installmentsTotal, setInstallmentsTotal] = useState('12');

  // Optimistic paid ledger: a Set of `${commitmentId}|${periodKey}` so a tick
  // reflects instantly, then reconciles on the action's revalidate.
  const paidBase = useMemo(() => {
    const set = new Set<string>();
    for (const [id, keys] of Object.entries(paidKeysByCommitment)) {
      for (const k of keys) set.add(`${id}|${k}`);
    }
    return set;
  }, [paidKeysByCommitment]);

  const [optimisticPaid, applyOptimisticPaid] = useOptimistic(
    paidBase,
    (current: ReadonlySet<string>, entry: string) => {
      const next = new Set(current);
      if (next.has(entry)) next.delete(entry);
      else next.add(entry);
      return next;
    },
  );

  /** The commitment's own paid-period key set, as the pure domain expects it. */
  const paidKeysOf = (id: string): ReadonlySet<string> => {
    const prefix = `${id}|`;
    const keys = new Set<string>();
    for (const entry of optimisticPaid) {
      if (entry.startsWith(prefix)) keys.add(entry.slice(prefix.length));
    }
    return keys;
  };

  const toDomain = (c: RawCommitment): Commitment => ({
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

  function onTogglePaid(c: RawCommitment) {
    const entry = `${c.id}|${periodKey(currentPeriod.year, currentPeriod.month)}`;
    // No manual rollback needed on failure: `useOptimistic` discards the
    // optimistic value when the transition settles and re-derives from
    // `paidBase` — which the server did NOT change on a rejected toggle. A
    // hand-rolled revert would double-toggle. Locked by a test (Sourcery #234).
    startTransition(async () => {
      applyOptimisticPaid(entry);
      try {
        const result = await toggleCommitmentPaymentAction({
          commitmentId: c.id,
          periodYear: currentPeriod.year,
          periodMonth: currentPeriod.month,
        });
        if (result.ok) {
          toast.success(result.data.paid ? t('toastMarkedPaid') : t('toastMarkedUnpaid'));
        } else {
          toast.error(translateError(result.errorCode));
        }
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        // eslint-disable-next-line no-console
        console.error('toggleCommitmentPaymentAction threw', err);
        toast.error(translateError('errors.commitments.payments.toggleFailed'));
      }
    });
  }

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const total = Number(totalAmount.replace(',', '.'));
    const perInstallment = Number(installmentAmount.replace(',', '.'));
    const count = Number(installmentsTotal);
    const isOneOff = kind === 'one_off';

    if (!Number.isFinite(total) || total < 0) {
      toast.error(translateError('errors.validation.generic'));
      return;
    }

    startTransition(async () => {
      try {
        const result = await createCommitmentAction({
          label: label.trim(),
          kind,
          totalAmount: total,
          // A one-off owes its total at once — no instalment amount.
          ...(isOneOff ? {} : { installmentAmount: perInstallment }),
          installmentsTotal: isOneOff ? 1 : count,
          startYear: currentPeriod.year,
          startMonth: currentPeriod.month,
          paymentDay: 1,
          frequency: 'monthly',
        });
        if (result.ok) {
          toast.success(t('toastCreated'));
          setLabel('');
          setTotalAmount('');
          setInstallmentAmount('');
          setShowAddForm(false);
        } else {
          toast.error(translateError(result.errorCode));
        }
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        // eslint-disable-next-line no-console
        console.error('createCommitmentAction threw', err);
        toast.error(translateError('errors.commitments.createFailed'));
      }
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      try {
        const result = await deleteCommitmentAction(id);
        if (result.ok) toast.success(t('toastDeleted'));
        else toast.error(translateError(result.errorCode));
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        // eslint-disable-next-line no-console
        console.error('deleteCommitmentAction threw', err);
        toast.error(translateError('errors.commitments.deleteFailed'));
      }
    });
  }

  const active = commitments.filter((c) => c.isActive);
  const totalRemaining = active.reduce(
    (sum, c) => sum + remainingBalance(toDomain(c), paidKeysOf(c.id)),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <Button
          type="button"
          variant={showAddForm ? 'outline' : 'default'}
          onClick={() => setShowAddForm((v) => !v)}
          aria-expanded={showAddForm}
          aria-controls="commitments-add-form"
          data-testid="commitments-add-toggle"
        >
          <Plus className="h-4 w-4" />
          {t('addFormTitle')}
        </Button>
      </header>

      {showAddForm && (
        <Card id="commitments-add-form">
          <CardHeader>
            <CardTitle>{t('addFormTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="commitment-label">{t('labelLabel')}</Label>
                <Input
                  id="commitment-label"
                  autoComplete="off"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  required
                  maxLength={120}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="commitment-kind">{t('kindLabel')}</Label>
                <select
                  id="commitment-kind"
                  data-testid="commitment-kind"
                  className="ankora-form-control-16 border-border bg-card text-foreground focus-visible:border-brand-600 h-10 w-full rounded-lg border px-3 py-2 shadow-sm transition-colors focus-visible:outline-none"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as CommitmentKind)}
                >
                  <option value="debt">{t('kinds.debt')}</option>
                  <option value="installment_plan">{t('kinds.installmentPlan')}</option>
                  <option value="one_off">{t('kinds.oneOff')}</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="commitment-total">{t('totalAmountLabel')}</Label>
                <Input
                  id="commitment-total"
                  type="number"
                  autoComplete="off"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  required
                />
                <p className="text-muted-foreground text-xs">{t('totalAmountHint')}</p>
              </div>
              {kind !== 'one_off' && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="commitment-installment">{t('installmentAmountLabel')}</Label>
                  <Input
                    id="commitment-installment"
                    type="number"
                    autoComplete="off"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={installmentAmount}
                    onChange={(e) => setInstallmentAmount(e.target.value)}
                    required
                  />
                </div>
              )}
              {kind !== 'one_off' && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="commitment-count">{t('installmentsTotalLabel')}</Label>
                  <Input
                    id="commitment-count"
                    type="number"
                    autoComplete="off"
                    inputMode="numeric"
                    min={1}
                    max={600}
                    value={installmentsTotal}
                    onChange={(e) => setInstallmentsTotal(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="md:col-span-2">
                <Button type="submit" disabled={isPending}>
                  <Plus className="h-4 w-4" />
                  {isPending ? t('adding') : t('addButton')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-baseline justify-between gap-3">
            <span>{t('count', { count: active.length })}</span>
            {active.length > 0 && (
              <span className="text-right">
                <span className="text-muted-foreground mr-1.5 text-xs font-normal">
                  {t('totalRemainingLabel')}
                </span>
                <span
                  className="text-foreground text-base font-bold tabular-nums"
                  data-testid="commitments-total-remaining"
                >
                  {formatCurrency(totalRemaining, locale)}
                </span>
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p data-testid="commitments-empty-state" className="text-muted-foreground text-sm">
              {t('emptyState')}
            </p>
          ) : (
            <ul role="list" className="divide-border/60 divide-y" data-testid="commitments-list">
              {active.map((c) => {
                const domain = toDomain(c);
                const paidKeys = paidKeysOf(c.id);
                const paid = installmentsPaid(domain, paidKeys);
                const remaining = remainingBalance(domain, paidKeys);
                const end = endPeriod(domain);
                const dueThisPeriod = isDueInPeriod(domain, currentPeriod);
                const tickedThisPeriod = paidKeys.has(
                  periodKey(currentPeriod.year, currentPeriod.month),
                );
                // Defensive clamp: the DB CHECK + Zod both keep
                // `installmentsTotal` in [1, 600] and `installmentsPaid` can
                // never exceed the schedule, so neither NaN nor >100 is
                // reachable today — but corrupted data must not produce an
                // invalid aria-valuenow or a bar wider than its track.
                const progress =
                  c.installmentsTotal > 0
                    ? Math.min(100, Math.max(0, Math.round((paid / c.installmentsTotal) * 100)))
                    : 0;
                const finished = c.installmentsTotal > 0 && paid >= c.installmentsTotal;

                return (
                  <li
                    key={c.id}
                    data-testid={`commitment-row-${c.id}`}
                    className="relative py-4 pr-24"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-foreground text-sm font-medium">
                        {c.label}
                        <span className="text-muted-foreground ml-2 text-xs font-normal">
                          {t(KIND_KEY[c.kind])}
                        </span>
                      </p>
                      <p className="text-right">
                        {finished ? (
                          <span
                            className="text-brand-text inline-flex items-center gap-1 text-sm font-semibold tabular-nums"
                            data-testid={`commitment-remaining-${c.id}`}
                          >
                            <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
                            {formatCurrency(0, locale)}
                          </span>
                        ) : (
                          <>
                            <span className="text-muted-foreground mr-1.5 text-xs">
                              {t('remainingLabel')}
                            </span>
                            <span
                              className="text-foreground text-sm font-semibold tabular-nums"
                              data-testid={`commitment-remaining-${c.id}`}
                            >
                              {formatCurrency(remaining, locale)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>

                    {/* Progress bar — pure CSS width, no inline style beyond the
                        computed percentage (CSP-safe: it is a style attribute,
                        not an inline <style> element). */}
                    <div
                      className="bg-surface-muted mt-2 h-1.5 w-full overflow-hidden rounded-full"
                      role="progressbar"
                      aria-valuenow={progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={t('progressAria', { label: c.label })}
                      data-testid={`commitment-progress-${c.id}`}
                    >
                      <div
                        className="bg-brand-600 h-full rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </div>

                    <p className="text-muted-foreground mt-1.5 text-xs">
                      {c.kind === 'one_off'
                        ? t('summaryOneOff', {
                            amount: formatCurrency(installmentAmountOf(domain), locale),
                            month: `${formatMonth(c.startMonth, locale, 'long')} ${c.startYear}`,
                          })
                        : t('summarySchedule', {
                            paid,
                            total: c.installmentsTotal,
                            amount: formatCurrency(installmentAmountOf(domain), locale),
                            end: `${formatMonth(end.month, locale, 'long')} ${end.year}`,
                          })}
                    </p>

                    {dueThisPeriod && (
                      <button
                        type="button"
                        onClick={() => onTogglePaid(c)}
                        disabled={isPending}
                        aria-pressed={tickedThisPeriod}
                        aria-label={
                          tickedThisPeriod
                            ? t('unmarkPaidAria', { label: c.label })
                            : t('markPaidAria', { label: c.label })
                        }
                        data-testid={`commitment-paid-${c.id}`}
                        className={`focus-visible:ring-brand-600 absolute top-3 right-12 flex size-11 cursor-pointer items-center justify-center rounded-full border-2 transition-colors [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:size-9 ${
                          tickedThisPeriod
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-border hover:border-brand-600 text-transparent'
                        }`}
                      >
                        <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
                      </button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(c.id)}
                      disabled={isPending}
                      aria-label={t('deleteAria', { label: c.label })}
                      data-testid={`commitment-delete-${c.id}`}
                      className="absolute top-3 right-0 size-11 shrink-0 md:size-9"
                    >
                      <Trash2 className="text-danger h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
