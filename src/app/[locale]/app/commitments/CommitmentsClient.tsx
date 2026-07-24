'use client';

import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { InstallmentStepper } from '@/components/commitments/InstallmentStepper';
import type { Locale } from '@/i18n/routing';
import {
  createCommitmentAction,
  deleteCommitmentAction,
  toggleCommitmentPaymentAction,
  updateCommitmentAction,
} from '@/lib/actions/commitments';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import { commitmentRowToDomain, type CommitmentRow } from '@/lib/data/commitment-row';
import {
  endPeriod,
  installmentAmountOf,
  installmentPeriods,
  installmentsPaid,
  periodKey,
  remainingBalance,
  type CommitmentKind,
  type Period,
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

type FormMode = 'closed' | 'create' | 'edit';

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

  // --- Form state (create + edit share one form; `formMode` is the single
  //     source of truth, `editingId` only meaningful in 'edit'). ---
  const [formMode, setFormMode] = useState<FormMode>('closed');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<CommitmentKind>('debt');
  const [totalAmount, setTotalAmount] = useState('');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [installmentsTotal, setInstallmentsTotal] = useState('12');

  function resetForm() {
    setLabel('');
    setKind('debt');
    setTotalAmount('');
    setInstallmentAmount('');
    setInstallmentsTotal('12');
    setEditingId(null);
  }

  function openCreate() {
    resetForm();
    setFormMode('create');
  }

  function openEdit(c: RawCommitment) {
    setEditingId(c.id);
    setLabel(c.label);
    setKind(c.kind);
    setTotalAmount(String(c.totalAmount));
    setInstallmentAmount(c.installmentAmount === null ? '' : String(c.installmentAmount));
    setInstallmentsTotal(String(c.installmentsTotal));
    setFormMode('edit');
  }

  function closeForm() {
    resetForm();
    setFormMode('closed');
  }

  // Optimistic paid ledger: a Set of `${commitmentId}|${periodKey}`. The reducer
  // takes an EXPLICIT intent (`{key, paid}`) rather than a blind toggle so a `+`
  // always adds and a `−` always removes — idempotent even on a stale read, so a
  // fast double-click can't accidentally cancel a payment. `useOptimistic`
  // discards the optimistic value on settle and re-derives from `paidBase`
  // (unchanged by a rejected toggle) → no manual rollback (Sourcery #234).
  const paidBase = useMemo(() => {
    const set = new Set<string>();
    for (const [id, keys] of Object.entries(paidKeysByCommitment)) {
      for (const k of keys) set.add(`${id}|${k}`);
    }
    return set;
  }, [paidKeysByCommitment]);

  const [optimisticPaid, applyOptimisticPaid] = useOptimistic(
    paidBase,
    (current: ReadonlySet<string>, action: { key: string; paid: boolean }) => {
      const next = new Set(current);
      if (action.paid) next.add(action.key);
      else next.delete(action.key);
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

  const toDomain = commitmentRowToDomain;

  /** Toggle ONE scheduled period, marking it paid or unpaid (explicit intent). */
  function togglePeriodPaid(c: RawCommitment, period: Period, markPaid: boolean) {
    const entry = `${c.id}|${periodKey(period.year, period.month)}`;
    startTransition(async () => {
      applyOptimisticPaid({ key: entry, paid: markPaid });
      try {
        const result = await toggleCommitmentPaymentAction({
          commitmentId: c.id,
          periodYear: period.year,
          periodMonth: period.month,
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

  /** `+` — mark the earliest not-yet-paid scheduled instalment (fills the oldest hole). */
  function onTickNext(c: RawCommitment) {
    const paidKeys = paidKeysOf(c.id);
    const next = installmentPeriods(toDomain(c)).find(
      (p) => !paidKeys.has(periodKey(p.year, p.month)),
    );
    if (next) togglePeriodPaid(c, next, true);
  }

  /** `−` — un-mark the latest paid scheduled instalment. */
  function onUntickLast(c: RawCommitment) {
    const paidKeys = paidKeysOf(c.id);
    const last = [...installmentPeriods(toDomain(c))]
      .reverse()
      .find((p) => paidKeys.has(periodKey(p.year, p.month)));
    if (last) togglePeriodPaid(c, last, false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const total = Number(totalAmount.replace(',', '.'));
    const perInstallment = Number(installmentAmount.replace(',', '.'));
    const count = Number(installmentsTotal);
    const isOneOff = kind === 'one_off';

    if (!Number.isFinite(total) || total < 0) {
      toast.error(translateError('errors.validation.generic'));
      return;
    }

    // Reduction guard (edit): never set installmentsTotal below what is already
    // ticked — that would silently orphan out-of-schedule ledger rows and drop
    // the visible paid count. Block with a friendly toast before the round-trip.
    if (formMode === 'edit' && editingId && !isOneOff) {
      const target = commitments.find((x) => x.id === editingId);
      if (target) {
        const alreadyPaid = installmentsPaid(toDomain(target), paidKeysOf(target.id));
        if (count < alreadyPaid) {
          toast.error(t('reductionBlocked', { paid: alreadyPaid }));
          return;
        }
      }
    }

    // A one-off owes its total at once — one instalment, no per-instalment amount.
    const payload = {
      label: label.trim(),
      kind,
      totalAmount: total,
      ...(isOneOff ? {} : { installmentAmount: perInstallment }),
      installmentsTotal: isOneOff ? 1 : count,
    };

    startTransition(async () => {
      try {
        const result = editingId
          ? await updateCommitmentAction(editingId, payload)
          : await createCommitmentAction({
              ...payload,
              startYear: currentPeriod.year,
              startMonth: currentPeriod.month,
              paymentDay: 1,
              frequency: 'monthly',
            });
        if (result.ok) {
          toast.success(editingId ? t('toastUpdated') : t('toastCreated'));
          closeForm();
        } else {
          toast.error(translateError(result.errorCode));
        }
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        // eslint-disable-next-line no-console
        console.error('commitment submit threw', err);
        toast.error(
          translateError(
            editingId ? 'errors.commitments.updateFailed' : 'errors.commitments.createFailed',
          ),
        );
      }
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      try {
        const result = await deleteCommitmentAction(id);
        if (result.ok) {
          toast.success(t('toastDeleted'));
          // If the deleted row was being edited, drop the stale form.
          if (editingId === id) closeForm();
        } else {
          toast.error(translateError(result.errorCode));
        }
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
  const isFormOpen = formMode !== 'closed';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <Button
          type="button"
          variant={formMode === 'create' ? 'outline' : 'default'}
          onClick={() => (formMode === 'create' ? closeForm() : openCreate())}
          aria-expanded={isFormOpen}
          aria-controls="commitments-form"
          data-testid="commitments-add-toggle"
        >
          <Plus className="h-4 w-4" />
          {t('addFormTitle')}
        </Button>
      </header>

      {isFormOpen && (
        <Card id="commitments-form">
          <CardHeader>
            <CardTitle>{formMode === 'edit' ? t('editFormTitle') : t('addFormTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
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
              <div className="flex items-center gap-3 md:col-span-2">
                <Button type="submit" disabled={isPending}>
                  {formMode === 'edit'
                    ? isPending
                      ? t('saving')
                      : t('saveButton')
                    : isPending
                      ? t('adding')
                      : t('addButton')}
                </Button>
                <Button type="button" variant="ghost" onClick={closeForm} disabled={isPending}>
                  {t('cancelButton')}
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
                // Defensive clamp: DB CHECK + Zod keep `installmentsTotal` in
                // [1, 600] and `installmentsPaid` can never exceed the schedule,
                // so neither NaN nor >100 is reachable — but corrupted data must
                // not produce an invalid aria-valuenow or an over-wide bar.
                const progress =
                  c.installmentsTotal > 0
                    ? Math.min(100, Math.max(0, Math.round((paid / c.installmentsTotal) * 100)))
                    : 0;
                const finished = c.installmentsTotal > 0 && paid >= c.installmentsTotal;

                return (
                  <li key={c.id} data-testid={`commitment-row-${c.id}`} className="py-4">
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

                    {/* Progress bar — width via the style attribute (a computed
                        percentage, CSP-safe: attribute, not an inline <style>). */}
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

                    {/* Controls row: payment stepper + edit + delete, in flow
                        (no absolute corners — makes room for all three). */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <InstallmentStepper
                        paid={paid}
                        total={c.installmentsTotal}
                        onTickNext={() => onTickNext(c)}
                        onUntickLast={() => onUntickLast(c)}
                        disabled={isPending}
                        countAriaLabel={t('installmentsCountAria', {
                          paid,
                          total: c.installmentsTotal,
                          label: c.label,
                        })}
                        markOneAriaLabel={t('markOneAria', { label: c.label })}
                        unmarkOneAriaLabel={t('unmarkOneAria', { label: c.label })}
                      />
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(c)}
                          disabled={isPending}
                          aria-label={t('editAria', { label: c.label })}
                          data-testid={`commitment-edit-${c.id}`}
                          className="size-11 shrink-0 md:size-9"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(c.id)}
                          disabled={isPending}
                          aria-label={t('deleteAria', { label: c.label })}
                          data-testid={`commitment-delete-${c.id}`}
                          className="size-11 shrink-0 md:size-9"
                        >
                          <Trash2 className="text-danger h-4 w-4" />
                        </Button>
                      </div>
                    </div>
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
