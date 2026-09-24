'use client';

import { useMemo, useOptimistic, useState, useSyncExternalStore, useTransition } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Plus,
  Repeat,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { MonthNav } from '@/components/period/MonthNav';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import {
  ConvertChargeSheet,
  type ConvertibleCharge,
} from '@/components/charges/ConvertChargeSheet';
import type { Locale } from '@/i18n/routing';
import { createChargeAction, deleteChargeAction, toggleWatchAction } from '@/lib/actions/charges';
import { togglePaymentAction } from '@/lib/actions/charge-payments';
import { toggleCommitmentPaymentAction } from '@/lib/actions/commitments';
import { togglePastDueObligationsAction } from '@/lib/actions/obligations';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import { currentPeriodDueDate, paymentMonthsFromFrequency } from '@/lib/domain/charges';
import type { SignalDoublon } from '@/lib/domain/obligations';
import { CHARGE_FREQUENCIES, type ChargeFrequency } from '@/lib/domain/types';
import { formatCurrency, formatDate, formatMonth } from '@/lib/i18n/formatters';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

import { CadenceField } from './CadenceField';
import { ChargeEditDrawer, type ChargeEditDrawerCharge } from './ChargeEditDrawer';

type Frequency = ChargeFrequency;

// Domain single source of truth — adding a frequency updates every call-site.
const FREQUENCIES = CHARGE_FREQUENCIES;

type RawCharge = {
  id: string;
  label: string;
  amount: number;
  frequency: string;
  dueMonth: number;
  paymentDay: number;
  paymentMonths: readonly number[];
  categoryId: string | null;
  isActive: boolean;
  /** Manual "à surveiller" dashboard marker (THI-329 PR-C). */
  isWatched: boolean;
  notes: string | null;
};

const WIDE_QUERY = '(min-width: 768px)';

function subscribeWide(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function readWide(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(WIDE_QUERY).matches;
}

/**
 * Today as an ISO `YYYY-MM-DD` string anchored to Europe/Brussels — same
 * timezone the rest of the cockpit uses for due-date math (cf.
 * `workspace-snapshot` and `dashboard/page`). Computing locally on the
 * client is fine here because `nextDueDateForCharge()` is a pure function
 * of the charge schedule + the reference ISO date.
 */
function todayBrusselsIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * ONE instalment of a commitment, falling due in the viewed period. Derived
 * server-side by `obligationsDuMois()` from the anchor + cadence + instalment
 * count — never a stored row (ADR-021). The tick it carries writes to
 * `commitment_payments`, the same table the commitment page ticks.
 */
export type CommitmentInstalmentRow = {
  id: string;
  label: string;
  amountDue: number;
  paymentDay: number;
  isPaid: boolean;
  installmentIndex: number;
  installmentsTotal: number;
};

export type LissagePart = {
  id: string;
  label: string;
  /** This bill's share of the month. */
  monthly: number;
  /** The bill's real amount, and every how many months it falls. */
  invoiceAmount: number;
  cycleMonths: number;
};

export type DuplicateWarning = {
  chargeId: string;
  chargeLabel: string;
  commitmentId: string;
  commitmentLabel: string;
  montant: number;
  signaux: readonly SignalDoublon[];
};

type ChargesClientProps = {
  charges: RawCharge[];
  /** Charge IDs already settled for `viewedPeriod` (seeds the Payé toggle). */
  paidChargeIds: string[];
  /** Commitment instalments falling due in `viewedPeriod`, tickable like bills. */
  commitmentInstalments: CommitmentInstalmentRow[];
  /** « À payer ce mois » — the CASH view: every occurrence due this month. */
  aPayerCeMoisTotal: number;
  /**
   * « Effort lissé » — the BUDGET view, for the CURRENT month.
   *
   * This REPLACED a `monthlyProvisionTotal` fed by `budget.ts`, which summed
   * charges only. The footer called it « Effort lissé / mois » while the
   * commitment instalments it omitted were deducted from « Budget du mois » —
   * the same two-perimeters-one-name defect this chantier exists to close, one
   * screen further down. One source now feeds both places.
   */
  effortLisseTotal: number;
  /** Annual equivalent of the smoothed effort — the same figure × 12. */
  effortLisseAnnuelTotal: number;
  /**
   * « Effort lissé » in its narrow sense (F-3): the monthly share of the
   * NON-monthly bills, part by part, each with the bill it comes from
   * (DESIGN-v3 rule 28). Straight from the domain's `lissageDuMois`.
   */
  lissage: { total: number; parts: readonly LissagePart[] };
  /**
   * The two other shares of `effortLisseTotal` (rule of code 10): the monthly
   * bills (`chargesFixesDuMois`) and the commitment instalments of the current
   * month (`engagementsDuMois`). With `lissage`, the three add up to the
   * total — the domain's `effortLisse` is exactly their sum.
   */
  monthlyBills: { total: number; parts: readonly LissagePart[] };
  commitmentShare: { total: number; parts: readonly LissagePart[] };
  /** Charge/commitment pairs that look like the same obligation entered twice. */
  duplicates: DuplicateWarning[];
  /** State of the bulk « échéances passées » gesture, derived server-side. */
  bulk: { gesture: 'pointer' | 'depointer' | 'rien'; pastDueCount: number };
  /**
   * The period IN VIEW (month-history navigation) — the ledger `paidChargeIds`
   * belongs to it and the Payé toggle writes to it. Usually today's month;
   * a past month when the user navigates back (`?period=YYYY-MM`).
   */
  viewedPeriod: { year: number; month: number };
  /** Month-history navigation state, computed server-side from `?period`. */
  periodNav: {
    /** Localized label of the viewed period (e.g. « juillet 2026 »). */
    label: string;
    /** `YYYY-MM` of the previous month, or null at the history floor. */
    prevParam: string | null;
    /** `YYYY-MM` of the next month, or null when viewing the current one. */
    nextParam: string | null;
    isCurrent: boolean;
    /** Localized label of today's month (the "back to" link target). */
    currentLabel: string;
  };
};

export function ChargesClient({
  charges,
  paidChargeIds,
  commitmentInstalments,
  aPayerCeMoisTotal,
  effortLisseTotal,
  effortLisseAnnuelTotal,
  lissage,
  monthlyBills,
  commitmentShare,
  duplicates,
  bulk,
  viewedPeriod,
  periodNav,
}: ChargesClientProps) {
  const t = useTranslations('app.charges');
  const tFreq = useTranslations('common.frequency');
  const tFreqAbbr = useTranslations('common.frequencyAbbr');
  const locale = useLocale() as Locale;
  const translateError = useActionErrorTranslator();

  const [isPending, startTransition] = useTransition();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [dueMonth, setDueMonth] = useState('1');
  const [paymentDay, setPaymentDay] = useState('1');
  const [editingCharge, setEditingCharge] = useState<ChargeEditDrawerCharge | null>(null);
  // The add form is collapsed by default: the monthly workflow is ticking
  // bills, not adding charges — the list must own the first screen
  // (dashboard-ux M1, scope validated @thierry 2026-07-18).
  const [showAddForm, setShowAddForm] = useState(false);
  const [convertingCharge, setConvertingCharge] = useState<ConvertibleCharge | null>(null);

  // F10 — a disclosure per cadence. Below `md`, « Mensuel » opens and the
  // others fold; from `md` up, everything opens. A tap overrides either way.
  // The width is read through `useSyncExternalStore` (false on the server and
  // in jsdom), never copied into state from an effect.
  const isWide = useSyncExternalStore(subscribeWide, readWide, () => false);
  const [groupOverride, setGroupOverride] = useState<Partial<Record<Frequency, boolean>>>({});
  const isGroupOpen = (freq: Frequency): boolean =>
    groupOverride[freq] ?? (isWide || freq === 'monthly');
  const toggleGroup = (freq: Frequency, open: boolean) =>
    setGroupOverride((prev) => ({ ...prev, [freq]: !open }));
  // F13 — the commitments group folds below `md` like a non-monthly cadence.
  const [commitmentsOpenOverride, setCommitmentsOpenOverride] = useState<boolean | null>(null);
  const commitmentsOpen = commitmentsOpenOverride ?? isWide;
  const [totalOpenOverride, setTotalOpenOverride] = useState<boolean | null>(null);
  const totalOpen = totalOpenOverride ?? isWide;

  const todayIso = useMemo(() => todayBrusselsIso(), []);

  // Group charges by frequency in a fixed display order. Empty buckets are
  // dropped so the list never shows a heading with no rows. The list stays
  // exhaustive — every charge is rendered (no active/inactive filter here);
  // only the money totals (server-side) skip inactive charges.
  // Rows are sorted by resolved due date ascending — a STABLE order (ticking a
  // bill never reorders rows under the user's finger, unlike unpaid-first).
  // The resolver is paid-independent for the date, so `isPaid: false` is fine.
  const groups = useMemo(() => {
    const dueIsoOf = (c: RawCharge): string =>
      currentPeriodDueDate(
        { isActive: c.isActive, paymentMonths: c.paymentMonths, paymentDay: c.paymentDay },
        viewedPeriod,
        todayIso,
        false,
      )?.dueDateIso ?? '9999-12-31';
    return FREQUENCIES.map((freq) => ({
      freq,
      rows: charges
        .filter((c) => c.frequency === freq)
        .map((c) => ({ c, dueIso: dueIsoOf(c) }))
        .sort((a, b) => (a.dueIso < b.dueIso ? -1 : a.dueIso > b.dueIso ? 1 : 0))
        .map(({ c }) => c),
    })).filter((group) => group.rows.length > 0);
  }, [charges, viewedPeriod, todayIso]);

  // Optimistic "Payé" state (plan-reviewer CR-1): `useOptimistic` seeds from
  // the server `paidChargeIds` and reconciles automatically once the action's
  // `revalidateAppPath('charges')` re-renders the page — no double source of
  // truth. On a failed toggle the DB is unchanged, so the base stays the same
  // and the optimistic flip rolls back when the transition settles.
  const paidBase = useMemo(() => new Set(paidChargeIds), [paidChargeIds]);
  const [optimisticPaid, applyOptimisticPaid] = useOptimistic(
    paidBase,
    (current: ReadonlySet<string>, chargeId: string) => {
      const next = new Set(current);
      if (next.has(chargeId)) next.delete(chargeId);
      else next.add(chargeId);
      return next;
    },
  );

  // Active charges due in the current period — the only ones exposing a toggle
  // (Phase 2 limit: a charge not due this month has no toggle, cf. plan CR-2).
  const dueThisMonth = useMemo(
    () => charges.filter((c) => c.isActive && c.paymentMonths.includes(viewedPeriod.month)),
    [charges, viewedPeriod.month],
  );

  // Commitment instalments carry their own optimistic set, seeded from the
  // server-derived rows. Same contract as `optimisticPaid` above: the action's
  // revalidate is the single source of truth once it settles.
  const instalmentPaidBase = useMemo(
    () => new Set(commitmentInstalments.filter((i) => i.isPaid).map((i) => i.id)),
    [commitmentInstalments],
  );
  const [optimisticInstalmentPaid, applyOptimisticInstalmentPaid] = useOptimistic(
    instalmentPaidBase,
    (current: ReadonlySet<string>, commitmentId: string) => {
      const next = new Set(current);
      if (next.has(commitmentId)) next.delete(commitmentId);
      else next.add(commitmentId);
      return next;
    },
  );

  function onToggleInstalmentPaid(row: CommitmentInstalmentRow) {
    startTransition(async () => {
      applyOptimisticInstalmentPaid(row.id);
      try {
        const result = await toggleCommitmentPaymentAction({
          commitmentId: row.id,
          periodYear: viewedPeriod.year,
          periodMonth: viewedPeriod.month,
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

  /**
   * ONE press for the whole month's past instalments — and the SAME press undoes
   * it. No confirmation dialog: the gesture is its own undo, and a dialog in
   * front of a reversible action costs a tap every month for nothing.
   *
   * The direction is decided by the SERVER from the current ledger, never sent
   * from here — a stale tab cannot make this wipe a month.
   */
  function onBulkPastDue() {
    startTransition(async () => {
      try {
        const result = await togglePastDueObligationsAction({
          periodYear: viewedPeriod.year,
          periodMonth: viewedPeriod.month,
        });
        if (!result.ok) {
          toast.error(translateError(result.errorCode));
          return;
        }
        const count = result.data.charges + result.data.commitments;
        if (result.data.mode === 'pointer') toast.success(t('bulkToastMarked', { count }));
        else if (result.data.mode === 'depointer') {
          toast.success(t('bulkToastUnmarked', { count }));
        }
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        // eslint-disable-next-line no-console
        console.error('togglePastDueObligationsAction threw', err);
        toast.error(translateError('errors.charges.payments.toggleFailed'));
      }
    });
  }

  // Optimistic "à surveiller" set — same seeding/reconciliation contract as
  // `optimisticPaid` above (server truth via revalidateAppPath on success).
  const watchedBase = useMemo(
    () => new Set(charges.filter((c) => c.isWatched).map((c) => c.id)),
    [charges],
  );
  const [optimisticWatched, applyOptimisticWatched] = useOptimistic(
    watchedBase,
    (current: ReadonlySet<string>, chargeId: string) => {
      const next = new Set(current);
      if (next.has(chargeId)) next.delete(chargeId);
      else next.add(chargeId);
      return next;
    },
  );

  function onToggleWatch(c: RawCharge) {
    startTransition(async () => {
      applyOptimisticWatched(c.id);
      try {
        const result = await toggleWatchAction(c.id);
        if (result.ok) {
          toast.success(result.data.watched ? t('toastWatched') : t('toastUnwatched'));
        } else {
          toast.error(translateError(result.errorCode));
        }
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        // eslint-disable-next-line no-console
        console.error('toggleWatchAction threw', err);
        toast.error(translateError('errors.charges.watchFailed'));
      }
    });
  }

  function onTogglePaid(c: RawCharge) {
    startTransition(async () => {
      applyOptimisticPaid(c.id);
      try {
        const result = await togglePaymentAction({
          chargeId: c.id,
          periodYear: viewedPeriod.year,
          periodMonth: viewedPeriod.month,
        });
        if (result.ok) {
          toast.success(result.data.paid ? t('toastMarkedPaid') : t('toastMarkedUnpaid'));
        } else {
          toast.error(translateError(result.errorCode));
        }
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        // eslint-disable-next-line no-console
        console.error('togglePaymentAction threw', err);
        toast.error(translateError('errors.charges.payments.toggleFailed'));
      }
    });
  }

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const parsedAmount = Number(amount.replace(',', '.'));
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      toast.error(translateError('errors.validation.generic'));
      return;
    }
    const parsedDueMonth = Number(dueMonth);
    const parsedPaymentDay = Number(paymentDay);
    const computedPaymentMonths = paymentMonthsFromFrequency(frequency, parsedDueMonth);

    startTransition(async () => {
      try {
        const result = await createChargeAction({
          label: label.trim(),
          amount: parsedAmount,
          frequency,
          dueMonth: parsedDueMonth,
          paymentDay: parsedPaymentDay,
          paymentMonths: computedPaymentMonths,
          categoryId: null,
          isActive: true,
          notes: null,
        });
        if (result.ok) {
          toast.success(t('toastCreated'));
          setLabel('');
          setAmount('');
          // Collapse after a successful add — the revalidated list (with the
          // new charge) becomes the confirmation; the toggle stays for more.
          setShowAddForm(false);
        } else {
          toast.error(translateError(result.errorCode));
        }
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        // eslint-disable-next-line no-console
        console.error('createChargeAction threw', err);
        toast.error(translateError('errors.charges.createFailed'));
      }
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      try {
        const result = await deleteChargeAction(id);
        if (result.ok) {
          toast.success(t('toastDeleted'));
          setEditingCharge(null);
        } else {
          toast.error(translateError(result.errorCode));
        }
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        // eslint-disable-next-line no-console
        console.error('deleteChargeAction threw', err);
        toast.error(translateError('errors.charges.deleteFailed'));
      }
    });
  }

  function onEdit(c: RawCharge) {
    setEditingCharge({
      id: c.id,
      label: c.label,
      amount: c.amount,
      frequency: c.frequency,
      dueMonth: c.dueMonth,
      paymentDay: c.paymentDay,
      paymentMonths: c.paymentMonths,
    });
  }

  /**
   * Current-period due date + status for a row (THI-329). Anchors to the
   * current month — it never rolls a paid or past current-month bill forward
   * ("juillet avant juin" fix) — and surfaces an `overdue` flag. `paid` is the
   * optimistic current-period paid state. Falls back to `formatMonth(dueMonth)`
   * when the resolver returns null (inactive / empty paymentMonths legacy data).
   */
  function periodDueFor(c: RawCharge, paid: boolean): { label: string; isOverdue: boolean } {
    const due = currentPeriodDueDate(
      { isActive: c.isActive, paymentMonths: c.paymentMonths, paymentDay: c.paymentDay },
      viewedPeriod,
      todayIso,
      paid,
    );
    if (!due) return { label: formatMonth(c.dueMonth, locale, 'long'), isOverdue: false };
    return {
      label: formatDate(due.dueDateIso, locale, 'medium'),
      isOverdue: due.status === 'overdue',
    };
  }

  /**
   * One bill row, as the v3 mockup draws it (F11): the tick — the row's ONE
   * action — then an opener that reads the description first, its amount, and
   * the date and cadence underneath. Edit, delete and « À surveiller » live in
   * the drawer the opener shows (F15). A charge not due this month keeps an
   * empty slot where the tick would be, so descriptions stay aligned.
   */
  function renderChargeRow(c: RawCharge) {
    const isDue = c.isActive && c.paymentMonths.includes(viewedPeriod.month);
    const paid = optimisticPaid.has(c.id);
    const { label: dueLabel, isOverdue } = periodDueFor(c, paid);
    return (
      <li
        key={c.id}
        data-testid={`charges-row-${c.id}`}
        className="flex items-start gap-2 px-2 py-2 md:px-3"
      >
        {isDue ? (
          <button
            type="button"
            onClick={() => onTogglePaid(c)}
            disabled={isPending}
            aria-pressed={paid}
            aria-label={
              paid ? t('unmarkPaidAria', { label: c.label }) : t('markPaidAria', { label: c.label })
            }
            data-testid={`charges-row-paid-${c.id}`}
            className="focus-visible:ring-brand-600 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              aria-hidden
              className={`flex size-7 items-center justify-center rounded-full border-2 transition-colors ${
                paid ? 'border-brand-600 bg-brand-600 text-white' : 'border-border text-transparent'
              }`}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
          </button>
        ) : (
          <span aria-hidden className="size-11 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => onEdit(c)}
          data-testid={`charges-row-open-${c.id}`}
          className="hover:bg-surface-muted focus-visible:ring-brand-600 flex min-h-11 min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-3">
              <span
                data-testid="charges-row-label"
                className="text-foreground min-w-0 text-sm font-medium [overflow-wrap:anywhere] md:text-base"
              >
                {c.label}
              </span>
              <span
                data-testid="charges-row-amount"
                className={`shrink-0 text-sm font-semibold tabular-nums md:text-base ${paid ? 'text-muted-foreground line-through' : 'text-foreground'}`}
              >
                {formatCurrency(c.amount, locale)}
              </span>
            </span>
            <span className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span
                data-testid="charges-row-next-due"
                className="inline-flex flex-wrap items-center gap-x-2 gap-y-1"
              >
                {dueLabel}
                {isOverdue && (
                  <span
                    data-testid={`charges-row-overdue-${c.id}`}
                    className="bg-danger rounded px-1.5 py-0.5 text-[11px] font-semibold text-white"
                  >
                    {t('statusOverdue')}
                  </span>
                )}
              </span>
              <span aria-hidden>·</span>
              {/* Frequency: neutral icon + abbreviation for the eye, the full
                  word for screen readers (VoiceOver skips <abbr title>). */}
              <span
                data-testid="charges-row-frequency"
                className="text-foreground inline-flex shrink-0 items-center gap-1 font-medium"
              >
                <Repeat aria-hidden="true" className="text-muted-foreground size-3" />
                <abbr
                  title={tFreq(c.frequency as Frequency)}
                  aria-hidden="true"
                  className="no-underline"
                >
                  {tFreqAbbr(c.frequency as Frequency)}
                </abbr>
                <span className="sr-only">{tFreq(c.frequency as Frequency)}</span>
              </span>
            </span>
          </span>
          <ChevronRight aria-hidden className="text-muted-foreground mt-1 h-4 w-4 shrink-0" />
        </button>
      </li>
    );
  }

  /**
   * One share of « Compté chaque mois » other than the smoothed one: its
   * total, then every line that composes it (rule of code 10). A share with
   * nothing in it is not drawn — an empty heading explains nothing.
   */
  function renderPoste(
    kind: 'monthly' | 'commitments',
    poste: { total: number; parts: readonly LissagePart[] },
  ) {
    if (poste.parts.length === 0) return null;
    const partTestId = kind === 'monthly' ? 'charges-monthly-part' : 'charges-commitment-part';
    return (
      <div data-testid={`charges-poste-${kind}`}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-foreground text-sm font-medium">
            {t(kind === 'monthly' ? 'posteMonthlyLabel' : 'posteCommitmentsLabel')}
          </span>
          <span
            data-testid={`charges-poste-${kind}-total`}
            className="text-foreground text-sm font-semibold tabular-nums"
          >
            {formatCurrency(poste.total, locale)}
          </span>
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {t(kind === 'monthly' ? 'posteMonthlyHint' : 'posteCommitmentsHint')}
        </p>
        <ul role="list" className="mt-2 flex flex-col gap-1.5">
          {poste.parts.map((p) => (
            <li
              key={p.id}
              data-testid={`${partTestId}-${p.id}`}
              className="flex items-baseline justify-between gap-3 text-xs"
            >
              <span className="text-foreground min-w-0">
                {p.cycleMonths > 1
                  ? t('lissagePartSource', {
                      label: p.label,
                      amount: formatCurrency(p.invoiceAmount, locale),
                      months: p.cycleMonths,
                    })
                  : p.label}
              </span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {t('lissagePartMonthly', { amount: formatCurrency(p.monthly, locale) })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  /**
   * Render ONE commitment instalment, in the same visual language as a charge
   * row. It is the point of the whole chantier: a duplicate between the two
   * families is only visible to the eye when both are in the same list.
   */
  function renderInstalmentRow(row: CommitmentInstalmentRow) {
    const paid = optimisticInstalmentPaid.has(row.id);
    const dueIso = `${viewedPeriod.year}-${String(viewedPeriod.month).padStart(2, '0')}-${String(
      Math.min(row.paymentDay, 28),
    ).padStart(2, '0')}`;
    // Same drawing as a bill row (F11): the tick, then the description first.
    return (
      <li
        key={row.id}
        data-testid={`charges-instalment-${row.id}`}
        className="flex items-start gap-2 px-2 py-2 md:px-3"
      >
        <button
          type="button"
          onClick={() => onToggleInstalmentPaid(row)}
          disabled={isPending}
          aria-pressed={paid}
          aria-label={
            paid
              ? t('unmarkCommitmentPaidAria', { label: row.label })
              : t('markCommitmentPaidAria', { label: row.label })
          }
          data-testid={`charges-instalment-paid-${row.id}`}
          className="focus-visible:ring-brand-600 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            aria-hidden
            className={`flex size-7 items-center justify-center rounded-full border-2 transition-colors ${
              paid ? 'border-brand-600 bg-brand-600 text-white' : 'border-border text-transparent'
            }`}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        </button>
        <div className="min-w-0 flex-1 px-2 py-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-foreground min-w-0 text-sm font-medium [overflow-wrap:anywhere] md:text-base">
              {row.label}
            </span>
            <span
              data-testid={`charges-instalment-amount-${row.id}`}
              className={`shrink-0 text-sm font-semibold tabular-nums md:text-base ${
                paid ? 'text-muted-foreground line-through' : 'text-foreground'
              }`}
            >
              {formatCurrency(row.amountDue, locale)}
            </span>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {formatDate(dueIso, locale, 'medium')}
            {' · '}
            <span data-testid={`charges-instalment-position-${row.id}`} className="tabular-nums">
              {t('installmentPosition', {
                index: row.installmentIndex,
                total: row.installmentsTotal,
              })}
            </span>
          </p>
        </div>
      </li>
    );
  }

  // "Ce mois" summary, derived from the optimistic paid sets so it updates the
  // instant a toggle is hit (distinct from the smoothed "Effort lissé" total).
  // Charges AND instalments: they are one month, so they are one countdown.
  const paidThisMonthCount =
    dueThisMonth.filter((c) => optimisticPaid.has(c.id)).length +
    commitmentInstalments.filter((i) => optimisticInstalmentPaid.has(i.id)).length;
  const dueThisMonthCount = dueThisMonth.length + commitmentInstalments.length;
  const remainingThisMonth =
    dueThisMonth.filter((c) => !optimisticPaid.has(c.id)).reduce((sum, c) => sum + c.amount, 0) +
    commitmentInstalments
      .filter((i) => !optimisticInstalmentPaid.has(i.id))
      .reduce((sum, i) => sum + i.amountDue, 0);
  // Count-based (not amount-based) so a 0 € bill still has to be ticked.
  const allPaidThisMonth = dueThisMonthCount > 0 && paidThisMonthCount === dueThisMonthCount;

  return (
    <div className="flex flex-col gap-6">
      {/* Header owns the add-form toggle: adding a charge is the RARE action
          (~once a month), ticking bills is the routine one — so the form is
          collapsed and the list gets the first screen (dashboard-ux M1). */}
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
          aria-controls="charges-add-form"
          data-testid="charges-add-toggle"
        >
          <Plus className="h-4 w-4" />
          {t('addFormTitle')}
        </Button>
      </header>

      {showAddForm && (
        <Card id="charges-add-form">
          <CardHeader>
            <CardTitle>{t('addFormTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="grid gap-4 md:grid-cols-2">
              {/* Compact layout (@thierry 2026-07-19): label + amount share one
                  row on ≥md — no more oversized full-width stacked fields. */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="label">{t('labelLabel')}</Label>
                <Input
                  id="label"
                  autoComplete="off"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  required
                  maxLength={120}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="amount">{t('amountLabel')}</Label>
                <Input
                  id="amount"
                  type="number"
                  autoComplete="off"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              {/* THI-301: unified cadence cluster replaces the 3 separate
                  fields (frequency / anchor month / day). The parent state and
                  onCreate submit logic are unchanged — conversion happens at
                  the component boundary. */}
              <div className="md:col-span-2">
                <CadenceField
                  idPrefix="create-charge"
                  value={{
                    frequency,
                    dueMonth: Number(dueMonth),
                    paymentDay: Number(paymentDay) || 1,
                  }}
                  onChange={(next) => {
                    setFrequency(next.frequency);
                    setDueMonth(String(next.dueMonth));
                    setPaymentDay(String(next.paymentDay));
                  }}
                />
              </div>
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

      {charges.length === 0 ? (
        <Card>
          <CardContent>
            <p data-testid="charges-empty-state" className="text-muted-foreground pt-6 text-sm">
              {t('emptyState')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Month-history navigator (@thierry 2026-07-19): browse any past
              month's paid/unpaid state; ticks stay editable. */}
          <MonthNav
            pathname="/app/charges"
            testIdPrefix="charges-period"
            label={periodNav.label}
            prevParam={periodNav.prevParam}
            nextParam={periodNav.nextParam}
            isCurrent={periodNav.isCurrent}
            labels={{
              navAria: t('periodNav.navAria'),
              prevAria: t('periodNav.prevAria'),
              nextAria: t('periodNav.nextAria'),
              backToCurrent: t('periodNav.backToCurrent', { month: periodNav.currentLabel }),
            }}
          />

          {/* The page's answer card (F8): what is still to pay, how many of
              the month's obligations are paid, and — its second row (F5) —
              everything falling due this month, paid included. Both read
              the SAME optimistic sets as the rows, so a tick moves them at
              once. */}
          <section
            data-testid="charges-head-card"
            aria-labelledby="charges-head-title"
            className={`border-border rounded-2xl border p-4 shadow-sm ${
              allPaidThisMonth ? 'bg-brand-600/10' : 'bg-card'
            }`}
          >
            <p className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
              {t('headEyebrow')}
            </p>
            <div
              data-testid="charges-paid-summary"
              className="mt-2"
              aria-live="polite"
              role="status"
              aria-atomic="true"
            >
              <h2
                id="charges-head-title"
                className={`flex items-center gap-1.5 text-sm font-medium ${
                  allPaidThisMonth ? 'text-brand-text' : 'text-foreground'
                }`}
              >
                {allPaidThisMonth && <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />}
                {allPaidThisMonth
                  ? periodNav.isCurrent
                    ? t('allPaidTitle')
                    : t('allPaidPeriod', { month: periodNav.label })
                  : periodNav.isCurrent
                    ? t('encoreAPayer')
                    : t('encoreAPayerPeriod', { month: periodNav.label })}
              </h2>
              <p
                data-testid="charges-remaining-amount"
                className={`text-3xl font-bold tracking-tight tabular-nums ${
                  allPaidThisMonth ? 'text-brand-text' : 'text-foreground'
                }`}
              >
                {formatCurrency(remainingThisMonth, locale)}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                {dueThisMonthCount > 0
                  ? t('paidCount', { paid: paidThisMonthCount, total: dueThisMonthCount })
                  : t('groupNothingDue')}
              </p>
            </div>
            <div className="border-border/60 mt-3 flex items-baseline justify-between gap-3 border-t pt-3">
              <div className="min-w-0">
                <p className="text-foreground text-sm">{t('aPayerCeMoisLabel')}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">{t('aPayerCeMoisHint')}</p>
              </div>
              <p
                data-testid="charges-a-payer-total"
                className="text-foreground shrink-0 text-base font-semibold tabular-nums"
              >
                {formatCurrency(aPayerCeMoisTotal, locale)}
              </p>
            </div>
          </section>

          {/* The heuristic WARNS. It never calculates — no total moves because
              of what is said here. */}
          {duplicates.map((d) => (
            <div
              key={`${d.chargeId}-${d.commitmentId}`}
              data-testid={`charges-duplicate-${d.chargeId}`}
              role="status"
              className="border-warning/40 bg-warning/10 flex gap-3 rounded-lg border p-3"
            >
              <AlertTriangle
                aria-hidden
                className="text-warning mt-0.5 h-4 w-4 shrink-0"
                strokeWidth={2}
              />
              <div className="min-w-0 text-xs leading-relaxed">
                <p className="text-foreground font-semibold">{t('duplicateTitle')}</p>
                <p className="text-foreground mt-0.5">
                  {t('duplicateBody', {
                    charge: d.chargeLabel,
                    commitment: d.commitmentLabel,
                    amount: formatCurrency(d.montant, locale),
                  })}
                </p>
                <p className="text-muted-foreground mt-0.5">
                  {t('duplicateSignals', {
                    signals: d.signaux
                      .map((s) =>
                        t(
                          s === 'montant'
                            ? 'signalMontant'
                            : s === 'jour'
                              ? 'signalJour'
                              : 'signalLibelle',
                        ),
                      )
                      .join(', '),
                  })}
                </p>
                <p className="text-muted-foreground mt-0.5">{t('duplicateNote')}</p>
              </div>
            </div>
          ))}

          {/* F9 — ONE gesture for the month's past instalments, and the same
              gesture undoes it. No dialog: the undo IS the button. The label
              is a sentence, so it may wrap (`whitespace-normal`, `h-auto`). */}
          {bulk.gesture !== 'rien' && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onBulkPastDue}
                disabled={isPending}
                className="h-auto min-w-0 py-2 text-left whitespace-normal"
                data-testid="charges-bulk-past-due"
                data-gesture={bulk.gesture}
              >
                <ListChecks className="h-4 w-4 shrink-0" aria-hidden />
                {bulk.gesture === 'pointer' ? t('bulkPastDue') : t('bulkPastDueUndo')}
              </Button>
              <span className="text-muted-foreground text-xs">
                {t('bulkPastDueCount', { count: bulk.pastDueCount })} · {t('bulkPastDueHint')}
              </span>
            </div>
          )}

          {dueThisMonthCount > 0 && !allPaidThisMonth && (
            <p className="text-muted-foreground text-xs" data-testid="charges-paid-hint">
              {t('paidHint')}
            </p>
          )}

          {/* F10 — one disclosure per cadence. « Mensuel » opens by default;
              the others start folded below `md` and open from `md` up. A
              folded cadence still says what it holds. The only `listitem`s
              are the rows, so their count still equals `charges.length` once
              every group is open. */}
          <div data-testid="charges-list" className="flex flex-col gap-3">
            {groups.map(({ freq, rows }) => {
              const headingId = `charges-group-${freq}-heading`;
              const listId = `charges-group-${freq}-list`;
              const open = isGroupOpen(freq);
              const groupDue = rows.filter(
                (c) => c.isActive && c.paymentMonths.includes(viewedPeriod.month),
              );
              const groupUnpaid = groupDue.filter((c) => !optimisticPaid.has(c.id));
              const groupRemaining = groupUnpaid.reduce((sum, c) => sum + c.amount, 0);
              const groupAllPaid = groupDue.length > 0 && groupUnpaid.length === 0;
              return (
                <section
                  key={freq}
                  data-testid={`charges-group-${freq}`}
                  aria-labelledby={headingId}
                  className="border-border bg-card rounded-2xl border"
                >
                  <h2 id={headingId} className="m-0">
                    <button
                      type="button"
                      onClick={() => toggleGroup(freq, open)}
                      aria-expanded={open}
                      aria-controls={listId}
                      data-testid={`charges-group-toggle-${freq}`}
                      className="hover:bg-surface-muted focus-visible:ring-brand-600 flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl px-4 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <span className="min-w-0 text-sm">
                        <span className="text-foreground font-semibold">{tFreq(freq)}</span>
                        <span className="text-muted-foreground">
                          {' · '}
                          {groupDue.length > 0
                            ? t('groupSummaryDue', {
                                unpaid: groupUnpaid.length,
                                due: groupDue.length,
                              })
                            : t('groupSummaryNone', { count: rows.length })}
                        </span>
                      </span>
                      <ChevronDown
                        aria-hidden
                        className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform ${
                          open ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </h2>
                  {open && (
                    <div id={listId} className="pb-2">
                      <ul role="list" className="divide-border/60 divide-y">
                        {rows.map((c) => renderChargeRow(c))}
                      </ul>
                      {/* One live figure per group: what is still to pay in
                          it this month, down to ✓ 0 €. */}
                      <p
                        data-testid={`charges-group-subtotal-${freq}`}
                        className="flex items-baseline justify-end gap-1.5 px-4 pt-1"
                      >
                        {groupDue.length === 0 ? (
                          <span className="text-muted-foreground text-xs">
                            {t('groupNothingDue')}
                          </span>
                        ) : groupAllPaid ? (
                          <span
                            data-testid={`charges-group-allpaid-${freq}`}
                            className="text-brand-text inline-flex items-center gap-1 text-sm font-semibold tabular-nums"
                          >
                            <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
                            {formatCurrency(0, locale)}
                          </span>
                        ) : (
                          <>
                            <span className="text-muted-foreground text-xs">
                              {t('groupRemainingLabel')}
                            </span>
                            <span
                              data-testid={`charges-group-remaining-${freq}`}
                              className="text-foreground text-sm font-semibold tabular-nums"
                            >
                              {formatCurrency(groupRemaining, locale)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  )}
                </section>
              );
            })}

            {/* The month's commitment instalments, in the SAME list: a bill
                and an instalment for the same obligation are visible side by
                side (F13). Derived, never stored (ADR-021). */}
            {commitmentInstalments.length > 0 && (
              <section
                data-testid="charges-group-commitments"
                aria-labelledby="charges-group-commitments-heading"
                className="border-border bg-card rounded-2xl border"
              >
                <h2 id="charges-group-commitments-heading" className="m-0">
                  <button
                    type="button"
                    onClick={() => setCommitmentsOpenOverride(!commitmentsOpen)}
                    aria-expanded={commitmentsOpen}
                    aria-controls="charges-group-commitments-list"
                    data-testid="charges-group-toggle-commitments"
                    className="hover:bg-surface-muted focus-visible:ring-brand-600 flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl px-4 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="min-w-0 text-sm">
                      <span className="text-foreground font-semibold">
                        {t('commitmentsGroupTitle')}
                      </span>
                      <span className="text-muted-foreground">
                        {' · '}
                        {t('instalmentCount', { count: commitmentInstalments.length })}
                      </span>
                    </span>
                    <ChevronDown
                      aria-hidden
                      className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform ${
                        commitmentsOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </h2>
                {commitmentsOpen && (
                  <ul
                    id="charges-group-commitments-list"
                    role="list"
                    className="divide-border/60 divide-y pb-2"
                  >
                    {commitmentInstalments.map((row) => renderInstalmentRow(row))}
                  </ul>
                )}
              </section>
            )}
          </div>

          {/* F6/F14 — what the month counts for your bills, opened on what
              composes it (rule of code 10). « Effort lissé » is only the
              monthly share of the NON-monthly bills (F-3), and each part says
              the bill, its real amount and its rhythm (DESIGN-v3 rule 28).
              The total is « Compté chaque mois », with its year beneath. */}
          <section
            data-testid="charges-total"
            aria-labelledby="charges-total-heading"
            className="border-border bg-card rounded-2xl border"
          >
            <h2 id="charges-total-heading" className="m-0">
              <button
                type="button"
                onClick={() => setTotalOpenOverride(!totalOpen)}
                aria-expanded={totalOpen}
                aria-controls="charges-total-body"
                data-testid="charges-total-toggle"
                className="hover:bg-surface-muted focus-visible:ring-brand-600 flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl px-4 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="text-foreground min-w-0 text-sm font-semibold">
                  {t('totalSectionTitle')}
                  <span className="text-muted-foreground font-normal tabular-nums">
                    {' · '}
                    {formatCurrency(effortLisseTotal, locale)}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden
                  className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform ${
                    totalOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </h2>
            {totalOpen && (
              <div id="charges-total-body" className="flex flex-col gap-3 px-4 pb-4">
                {renderPoste('monthly', monthlyBills)}
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-foreground text-sm font-medium">
                      {t('effortLisseLabel')}
                    </span>
                    <span
                      data-testid="charges-effort-lisse-total"
                      className="text-foreground text-sm font-semibold tabular-nums"
                    >
                      {formatCurrency(lissage.total, locale)}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs">{t('effortLisseHint')}</p>
                  {lissage.parts.length > 0 && (
                    <ul role="list" className="mt-2 flex flex-col gap-1.5">
                      {lissage.parts.map((p) => (
                        <li
                          key={p.id}
                          data-testid={`charges-lissage-part-${p.id}`}
                          className="flex items-baseline justify-between gap-3 text-xs"
                        >
                          <span className="text-foreground min-w-0">
                            {t('lissagePartSource', {
                              label: p.label,
                              amount: formatCurrency(p.invoiceAmount, locale),
                              months: p.cycleMonths,
                            })}
                          </span>
                          <span className="text-muted-foreground shrink-0 tabular-nums">
                            {t('lissagePartMonthly', {
                              amount: formatCurrency(p.monthly, locale),
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {renderPoste('commitments', commitmentShare)}
                <div className="border-border/60 border-t pt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-foreground text-sm font-medium">
                      {t('totalMonthlyLabel')}
                    </span>
                    <span
                      data-testid="charges-total-monthly"
                      className="text-foreground text-base font-semibold tabular-nums"
                    >
                      {formatCurrency(effortLisseTotal, locale)}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs">{t('totalMonthlyHint')}</p>
                  <p
                    data-testid="charges-total-annual"
                    className="text-muted-foreground mt-0.5 text-xs tabular-nums"
                  >
                    {t('totalAnnualLine', {
                      amount: formatCurrency(effortLisseAnnuelTotal, locale),
                    })}
                  </p>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* Mounted per opening, keyed on the charge: closing unmounts it, so a
          pending delete confirmation or an unsaved edit never survives into
          the next opening (Reviewer, E1 bis). */}
      {editingCharge && (
        <ChargeEditDrawer
          key={editingCharge.id}
          charge={editingCharge}
          onClose={() => setEditingCharge(null)}
          watched={optimisticWatched.has(editingCharge.id)}
          onToggleWatch={() => {
            const c = charges.find((x) => x.id === editingCharge.id);
            if (c) onToggleWatch(c);
          }}
          onDelete={onDelete}
          pendingOutside={isPending}
          // Sequential panels, never nested: the drawer closes, then the sheet
          // opens on the same charge.
          onConvert={(c) => {
            setEditingCharge(null);
            setConvertingCharge({
              id: c.id,
              label: c.label,
              amount: c.amount,
              frequency: c.frequency,
              paymentDay: c.paymentDay,
              paymentMonths: c.paymentMonths,
            });
          }}
        />
      )}
      <ConvertChargeSheet
        charge={convertingCharge}
        onClose={() => setConvertingCharge(null)}
        locale={locale}
      />
    </div>
  );
}
