'use client';

import { useEffect, useMemo, useOptimistic, useState, useTransition } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
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
  endInstallmentDate,
  endPeriod,
  firstInstallmentDate,
  hasIrregularFinalInstallment,
  installmentAmountOf,
  installmentPeriods,
  installmentsPaid,
  lastInstallmentAmount,
  periodKey,
  remainingBalance,
  type Commitment,
  type CommitmentFrequency,
  type CommitmentKind,
  type Period,
} from '@/lib/domain/commitments';
import { formatCurrency, formatInstallmentDate, formatMonth } from '@/lib/i18n/formatters';
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

const FREQUENCY_KEY = {
  monthly: 'frequencies.monthly',
  quarterly: 'frequencies.quarterly',
  semiannual: 'frequencies.semiannual',
  annual: 'frequencies.annual',
} as const;

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/**
 * The payment day is optional in the form: an empty field stores 1, which the
 * domain reads back as "never chosen" (`hasExplicitPaymentDay`). Keeping the
 * two ends of that convention in one place — the form writes what the domain
 * expects to read.
 */
const PAYMENT_DAY_UNSET = 1;

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
  // The first instalment: entered by the user, NOT inferred from the creation
  // month. Anchoring on "now" is what pushed the SPF plan's end date two
  // months out — the app answered a question it had never asked.
  const [startMonth, setStartMonth] = useState(String(currentPeriod.month));
  const [startYear, setStartYear] = useState(String(currentPeriod.year));
  const [paymentDay, setPaymentDay] = useState('');
  const [frequency, setFrequency] = useState<CommitmentFrequency>('monthly');

  function resetForm() {
    setLabel('');
    setKind('debt');
    setTotalAmount('');
    setInstallmentAmount('');
    setInstallmentsTotal('12');
    setStartMonth(String(currentPeriod.month));
    setStartYear(String(currentPeriod.year));
    setPaymentDay('');
    setFrequency('monthly');
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
    setStartMonth(String(c.startMonth));
    setStartYear(String(c.startYear));
    // A stored 1 means "never chosen" — show it as empty rather than as a
    // decision the user never made.
    setPaymentDay(c.paymentDay > PAYMENT_DAY_UNSET ? String(c.paymentDay) : '');
    setFrequency(c.frequency);
    setFormMode('edit');
  }

  function closeForm() {
    resetForm();
    setFormMode('closed');
  }

  // When the form opens (create OR edit), bring it into view and move focus into
  // it. Without this, clicking the pencil on a row far down the list opens the
  // form at the TOP of the page — off-screen, with no change for a sighted user
  // and no cue for keyboard/screen-reader users (dashboard-ux-auditor P1).
  useEffect(() => {
    if (formMode === 'closed') return;
    // `preventScroll` so focus doesn't jump instantly — the scroll below does
    // the moving. `scrollIntoView` is guarded (jsdom doesn't implement it).
    document.getElementById('commitment-label')?.focus({ preventScroll: true });
    // Respect prefers-reduced-motion (WCAG 2.3.3): no smooth animation for users
    // who asked to reduce motion — jump instantly instead (Codex review).
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById('commitments-form')
      ?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }, [formMode, editingId]);

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

    const anchorYear = Number(startYear);
    const anchorMonth = Number(startMonth);
    if (
      !Number.isInteger(anchorYear) ||
      anchorYear < 2000 ||
      anchorYear > 2100 ||
      !Number.isInteger(anchorMonth) ||
      anchorMonth < 1 ||
      anchorMonth > 12
    ) {
      toast.error(translateError('errors.validation.generic'));
      return;
    }

    // Empty stays empty: 1 is the column default AND the "never chosen"
    // marker, so an untouched field must not masquerade as "the 1st".
    const day = paymentDay.trim() === '' ? PAYMENT_DAY_UNSET : Number(paymentDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
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

    // A one-off owes its total at once — one instalment, no per-instalment
    // amount, and no cadence to speak of.
    const payload = {
      label: label.trim(),
      kind,
      totalAmount: total,
      ...(isOneOff ? {} : { installmentAmount: perInstallment }),
      installmentsTotal: isOneOff ? 1 : count,
      startYear: anchorYear,
      startMonth: anchorMonth,
      paymentDay: day,
      frequency: isOneOff ? ('monthly' as const) : frequency,
    };

    startTransition(async () => {
      try {
        const result = editingId
          ? await updateCommitmentAction(editingId, payload)
          : await createCommitmentAction(payload);
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

  /**
   * Live consequence of what is currently typed: « mai 2026 → mars 2027 ».
   * The schedule is derived, so the user has no other way to see what a first
   * instalment + a count actually produce before committing to them.
   * Null while the inputs are not yet a valid schedule (no half-computed span).
   */
  const draftWindow = useMemo(() => {
    const year = Number(startYear);
    const month = Number(startMonth);
    const count = kind === 'one_off' ? 1 : Number(installmentsTotal);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    if (!Number.isInteger(count) || count < 1 || count > 600) return null;
    const day = paymentDay.trim() === '' ? PAYMENT_DAY_UNSET : Number(paymentDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;

    const draft: Commitment = {
      id: 'draft',
      kind,
      totalAmount: 0,
      installmentAmount: null,
      installmentsTotal: count,
      startYear: year,
      startMonth: month,
      paymentDay: day,
      frequency: kind === 'one_off' ? 'monthly' : frequency,
      isActive: true,
    };
    return {
      first: formatInstallmentDate(firstInstallmentDate(draft), locale),
      last: formatInstallmentDate(endInstallmentDate(draft), locale),
      single: count === 1,
    };
  }, [startYear, startMonth, installmentsTotal, paymentDay, frequency, kind, locale]);

  /**
   * What the pending edit would change, computed from the SAME derivations the
   * list renders (`endPeriod`, `remainingBalance`) — nothing here is stored, so
   * the preview and the saved row cannot disagree.
   *
   * « Ce qui est dérivé reste recalculé, jamais figé » (§1.7): moving
   * `installmentsTotal` from 35 to 34 shifts the end date and the outstanding
   * balance with no further action. That consequence belongs on screen BEFORE
   * validation — same principle as the « Il te restera X € » of the expense
   * sheet.
   */
  const editConsequence = useMemo(() => {
    if (formMode !== 'edit' || !editingId) return null;
    const target = commitments.find((c) => c.id === editingId);
    if (!target) return null;

    const count = Number(installmentsTotal);
    const perInstallment = Number(installmentAmount.replace(',', '.'));
    const total = Number(totalAmount.replace(',', '.'));
    if (!Number.isFinite(count) || count < 1 || !Number.isFinite(total)) return null;

    const before = commitmentRowToDomain(target);
    const after = {
      ...before,
      installmentsTotal: kind === 'one_off' ? 1 : count,
      installmentAmount:
        kind === 'one_off' || !Number.isFinite(perInstallment) ? null : perInstallment,
      totalAmount: total,
    };
    const paidKeys = paidKeysOf(target.id);
    const fromEnd = endPeriod(before);
    const toEnd = endPeriod(after);
    const fromBalance = remainingBalance(before, paidKeys);
    const toBalance = remainingBalance(after, paidKeys);
    if (fromEnd.year === toEnd.year && fromEnd.month === toEnd.month && fromBalance === toBalance) {
      return { changed: false as const };
    }
    return { changed: true as const, fromEnd, toEnd, fromBalance, toBalance };
    // `paidKeysOf` reads the optimistic set, which is stable between ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formMode,
    editingId,
    commitments,
    installmentsTotal,
    installmentAmount,
    totalAmount,
    kind,
    optimisticPaid,
  ]);

  const monthLabelOf = (p: Period) => `${formatMonth(p.month, locale, 'long')} ${p.year}`;

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
                  <p className="text-muted-foreground text-xs">{t('installmentsTotalHint')}</p>
                </div>
              )}

              {/* First instalment — month + year as two controls rather than
                  `input[type=month]`, which iOS Safari degrades to a free-text
                  field (mobile-ios-auditor). */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="commitment-start-month">{t('startMonthLabel')}</Label>
                <div className="flex gap-2">
                  <select
                    id="commitment-start-month"
                    data-testid="commitment-start-month"
                    aria-label={t('startMonthAria')}
                    className="ankora-form-control-16 border-border bg-card text-foreground focus-visible:border-brand-600 h-10 w-full rounded-lg border px-3 py-2 shadow-sm transition-colors focus-visible:outline-none"
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value)}
                  >
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>
                        {formatMonth(m, locale, 'long')}
                      </option>
                    ))}
                  </select>
                  <Input
                    id="commitment-start-year"
                    data-testid="commitment-start-year"
                    type="number"
                    autoComplete="off"
                    inputMode="numeric"
                    aria-label={t('startYearAria')}
                    min={2000}
                    max={2100}
                    className="w-28 shrink-0"
                    value={startYear}
                    onChange={(e) => setStartYear(e.target.value)}
                    required
                  />
                </div>
                <p className="text-muted-foreground text-xs">{t('startHint')}</p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="commitment-payment-day">{t('paymentDayLabel')}</Label>
                <Input
                  id="commitment-payment-day"
                  data-testid="commitment-payment-day"
                  type="number"
                  autoComplete="off"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={paymentDay}
                  onChange={(e) => setPaymentDay(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">{t('paymentDayHint')}</p>
              </div>

              {kind !== 'one_off' && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="commitment-frequency">{t('frequencyLabel')}</Label>
                  <select
                    id="commitment-frequency"
                    data-testid="commitment-frequency"
                    className="ankora-form-control-16 border-border bg-card text-foreground focus-visible:border-brand-600 h-10 w-full rounded-lg border px-3 py-2 shadow-sm transition-colors focus-visible:outline-none"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as CommitmentFrequency)}
                  >
                    {(Object.keys(FREQUENCY_KEY) as CommitmentFrequency[]).map((f) => (
                      <option key={f} value={f}>
                        {t(FREQUENCY_KEY[f])}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {draftWindow && (
                <p
                  className="text-muted-foreground bg-surface-muted rounded-lg px-3 py-2 text-xs md:col-span-2"
                  data-testid="commitment-window-preview"
                >
                  {draftWindow.single
                    ? t('windowPreviewSingle', { first: draftWindow.first })
                    : t('windowPreview', { first: draftWindow.first, last: draftWindow.last })}
                </p>
              )}

              {editConsequence && (
                <div className="md:col-span-2" data-testid="commitment-edit-consequence">
                  <p className="text-muted-foreground text-xs font-medium">
                    {t('editConsequenceLabel')}
                  </p>
                  <p
                    className="text-foreground text-sm tabular-nums"
                    aria-live="polite"
                    data-testid="commitment-edit-consequence-text"
                  >
                    {editConsequence.changed
                      ? t('editConsequence', {
                          fromEnd: monthLabelOf(editConsequence.fromEnd),
                          toEnd: monthLabelOf(editConsequence.toEnd),
                          fromBalance: formatCurrency(editConsequence.fromBalance, locale),
                          toBalance: formatCurrency(editConsequence.toBalance, locale),
                        })
                      : t('editNoChange')}
                  </p>
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
                const end = formatInstallmentDate(endInstallmentDate(domain), locale);
                const irregular = hasIrregularFinalInstallment(domain);
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

                    {/* The shared primitive, whose fill is an SVG <rect> whose
                        geometry is an ATTRIBUTE. The hand-rolled bar this
                        replaces set its width through `style={{ width }}`,
                        under a comment claiming that was CSP-safe: it is not.
                        `style-src 'self' 'nonce-…'` drops style ATTRIBUTES
                        (a nonce voids 'unsafe-inline', and without
                        `style-src-attr` attributes fall back to `style-src`),
                        so the fill kept its natural 100 % width and every plan
                        read as complete. Explicit `tone` — the primitive's
                        auto-tone turns warning past 85 %, which is right for a
                        budget being consumed and wrong for a debt being
                        repaid, where near-100 % is the good news. */}
                    <div className="mt-2">
                      <Progress
                        value={progress}
                        max={100}
                        tone="brand"
                        size="sm"
                        ariaLabel={t('progressAria', { label: c.label })}
                        testId={`commitment-progress-${c.id}`}
                      />
                    </div>

                    <p className="text-muted-foreground mt-1.5 text-xs">
                      {c.kind === 'one_off'
                        ? t('summaryOneOff', {
                            amount: formatCurrency(installmentAmountOf(domain), locale),
                            month: formatInstallmentDate(firstInstallmentDate(domain), locale),
                          })
                        : irregular
                          ? t('summaryScheduleIrregular', {
                              paid,
                              total: c.installmentsTotal,
                              regular: c.installmentsTotal - 1,
                              amount: formatCurrency(installmentAmountOf(domain), locale),
                              lastAmount: formatCurrency(lastInstallmentAmount(domain), locale),
                              end,
                            })
                          : t('summarySchedule', {
                              paid,
                              total: c.installmentsTotal,
                              amount: formatCurrency(installmentAmountOf(domain), locale),
                              end,
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
