'use client';

import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { Bookmark, Check, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import type { Locale } from '@/i18n/routing';
import { createChargeAction, deleteChargeAction, toggleWatchAction } from '@/lib/actions/charges';
import { togglePaymentAction } from '@/lib/actions/charge-payments';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import { currentPeriodDueDate, paymentMonthsFromFrequency } from '@/lib/domain/charges';
import { formatCurrency, formatDate, formatMonth } from '@/lib/i18n/formatters';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

import { ChargeEditDrawer, type ChargeEditDrawerCharge } from './ChargeEditDrawer';

type Frequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

const MONTH_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const FREQUENCIES: readonly Frequency[] = ['monthly', 'quarterly', 'semiannual', 'annual'];

// Literal key map keeps next-intl's typed `t()` happy on a per-frequency key.
// The unit suffix disambiguates the group subtotals: the monthly one is
// per MONTH, the annual one per YEAR — same label, different time units,
// a real source of confusion without it (@thierry 2026-07-18).
const SUBTOTAL_UNIT_KEY = {
  monthly: 'subtotalUnit.monthly',
  quarterly: 'subtotalUnit.quarterly',
  semiannual: 'subtotalUnit.semiannual',
  annual: 'subtotalUnit.annual',
} as const;

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

type ChargesClientProps = {
  charges: RawCharge[];
  /** Raw amount summed per frequency bucket (active charges only), computed
   *  server-side in the pure domain and crossed as `number`. */
  subtotals: Record<Frequency, number>;
  /** Smoothed monthly provisioning effort across all active charges. */
  monthlyProvisionTotal: number;
  /** Annual equivalent of all active charges. */
  annualTotal: number;
  /** Charge IDs already settled for `currentPeriod` (seeds the Payé toggle). */
  paidChargeIds: string[];
  /** Current period (Europe/Brussels), the toggle's write target. */
  currentPeriod: { year: number; month: number };
};

export function ChargesClient({
  charges,
  subtotals,
  monthlyProvisionTotal,
  annualTotal,
  paidChargeIds,
  currentPeriod,
}: ChargesClientProps) {
  const t = useTranslations('app.charges');
  const tFreq = useTranslations('common.frequency');
  const tFreqAbbr = useTranslations('common.frequencyAbbr');
  const tMonths = useTranslations('common.months');
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
        currentPeriod,
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
  }, [charges, currentPeriod, todayIso]);

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
    () => charges.filter((c) => c.isActive && c.paymentMonths.includes(currentPeriod.month)),
    [charges, currentPeriod.month],
  );

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
      currentPeriod,
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
   * Render a single charge row. Mobile: a flat two-line row separated from its
   * neighbours by the group `<ul>`'s `divide-y` (no card chrome). Desktop:
   * `md:grid` projects the cells onto a 6-column baseline-aligned row via
   * `md:contents`. The edit/delete buttons stay absolute top-right on mobile
   * (`pr-24` reserves their space) and become inline cells 5/6 on desktop.
   */
  function renderChargeRow(c: RawCharge) {
    const isDue = c.isActive && c.paymentMonths.includes(currentPeriod.month);
    const paid = optimisticPaid.has(c.id);
    const watched = optimisticWatched.has(c.id);
    const { label: dueLabel, isOverdue } = periodDueFor(c, paid);
    return (
      <li
        key={c.id}
        data-testid={`charges-row-${c.id}`}
        // `min-h-13` (52px) guarantees the row is always at least as tall as the
        // absolute edit/delete buttons (top-2 + size-11 = 52px) now that the
        // card padding (`p-4`) is gone — prevents the tap targets overflowing
        // onto the next row on very short content (mobile-ios-auditor F3).
        // Due-this-month rows reserve left room (`pl-14`/`md:pl-12`) for the
        // absolutely-positioned Payé toggle — keeps the 6-col desktop grid and
        // its baseline contract untouched (plan-reviewer CR-3).
        className={`md:hover:bg-surface-muted relative min-h-14 py-3 pr-36 transition-colors md:grid md:min-h-0 md:grid-cols-[minmax(8rem,10rem)_minmax(0,1fr)_4.5rem_7rem_auto_auto_auto] md:items-baseline md:gap-4 md:py-3 md:pr-2 ${isDue ? 'pl-14 md:pl-12' : 'px-3 md:px-4'}`}
      >
        {/* Payé toggle — absolute left for due-this-month charges. Lives
            outside the grid + the mobile flow so it never disturbs the four
            baseline-measured cells. 44px touch target on mobile. */}
        {isDue && (
          <button
            type="button"
            onClick={() => onTogglePaid(c)}
            disabled={isPending}
            aria-pressed={paid}
            aria-label={
              paid ? t('unmarkPaidAria', { label: c.label }) : t('markPaidAria', { label: c.label })
            }
            data-testid={`charges-row-paid-${c.id}`}
            className={`focus-visible:ring-brand-600 absolute top-2 left-2 flex size-11 cursor-pointer items-center justify-center rounded-full border-2 transition-colors [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:top-1/2 md:left-3 md:size-7 md:-translate-y-1/2 ${
              paid
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-border hover:border-brand-600 text-transparent'
            }`}
          >
            <Check className="h-4 w-4 md:h-3.5 md:w-3.5" strokeWidth={3} aria-hidden />
          </button>
        )}

        {/* Mobile: header row (next-due + amount on a single line).
            Desktop: contents — projects next-due + amount as grid cells 1 / 4. */}
        <div className="flex items-baseline justify-between gap-3 md:contents">
          {/* Date stays neutral (muted) in both themes; the overdue signal is
              carried by the solid badge below — not by colouring the date, which
              would be color-only (WCAG 1.4.1) and fail AA on the dark card
              (`--color-danger` has no dark override). The badge uses white on a
              solid `danger` fill = 4.84:1 in both themes (dashboard-ux C1). */}
          <span
            data-testid="charges-row-next-due"
            className="text-muted-foreground inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium tracking-wide md:order-1 md:text-sm"
          >
            {dueLabel}
            {isOverdue && (
              <span
                data-testid={`charges-row-overdue-${c.id}`}
                className="bg-danger rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-normal text-white"
              >
                {t('statusOverdue')}
              </span>
            )}
          </span>
          <span
            data-testid="charges-row-amount"
            className={`shrink-0 text-base font-semibold tabular-nums md:order-4 md:text-right md:text-sm md:font-medium ${paid ? 'text-muted-foreground line-through' : 'text-foreground'}`}
          >
            {formatCurrency(c.amount, locale)}
          </span>
        </div>

        {/* Mobile: body row (label + frequency chip).
            Desktop: contents — projects label + chip as cells 2 / 3. */}
        <div className="mt-2 flex items-center gap-2 md:mt-0 md:contents">
          <span
            data-testid="charges-row-label"
            className="text-foreground min-w-0 truncate text-sm font-medium md:order-2 md:text-base"
          >
            {c.label}
          </span>
          {/* Frequency tag (THI-299): a neutral recurrence icon + the locale
              abbreviation in `text-foreground`. NOT colour-coded — colour stays
              reserved for the category `color_token` (@thierry locked). The
              previous pill used `bg-surface-muted` (~1.05:1 on the card →
              invisible) AND `text-muted-foreground` (identical to the next-due
              label). The fix carries visibility + distinction on three opaque,
              token-only signals instead of an invisible container: the icon, the
              `text-foreground` colour (vs muted next-due, AAA on card), and the
              abbreviated form. No border/fill, so no dependency on the
              undefined `--color-border-strong` token. a11y: the icon is
              decorative; the visible abbreviation is `aria-hidden` and the full
              word is exposed to screen readers via `sr-only` (robust across
              VoiceOver, which does not reliably announce `<abbr title>`), while
              sighted users still get the full word on hover via `title`. */}
          <span
            data-testid="charges-row-frequency"
            className="text-foreground inline-flex w-fit shrink-0 items-center gap-1 text-xs font-medium md:order-3"
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
        </div>

        {/* Watch + Edit + Delete: stacked top-right tap targets on mobile,
            inline cells 5 / 6 / 7 on desktop. The Bookmark fills brand when
            the charge is flagged "à surveiller" (dashboard section). */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onToggleWatch(c)}
          disabled={isPending}
          aria-pressed={watched}
          aria-label={
            watched ? t('unwatchAria', { label: c.label }) : t('watchAria', { label: c.label })
          }
          data-testid={`charges-row-watch-${c.id}`}
          className="absolute top-2 right-26 size-11 shrink-0 md:static md:order-5 md:size-9 md:self-center"
        >
          <Bookmark
            className={`h-4 w-4 ${watched ? 'text-brand-text' : 'text-muted-foreground'}`}
            fill={watched ? 'currentColor' : 'none'}
          />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onEdit(c)}
          disabled={isPending}
          aria-label={t('editAria', { label: c.label })}
          data-testid={`charges-row-edit-${c.id}`}
          className="absolute top-2 right-14 size-11 shrink-0 md:static md:order-6 md:size-9 md:self-center"
        >
          <Pencil className="text-muted-foreground h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(c.id)}
          disabled={isPending}
          aria-label={t('deleteAria', { label: c.label })}
          data-testid={`charges-row-delete-${c.id}`}
          className="absolute top-2 right-2 size-11 shrink-0 md:static md:order-7 md:size-9 md:self-center"
        >
          <Trash2 className="text-danger h-4 w-4" />
        </Button>
      </li>
    );
  }

  // "Ce mois" summary, derived from the optimistic paid set so it updates the
  // instant a toggle is hit (distinct from the smoothed "Effort lissé" total).
  const paidThisMonthCount = dueThisMonth.filter((c) => optimisticPaid.has(c.id)).length;
  const remainingThisMonth = dueThisMonth
    .filter((c) => !optimisticPaid.has(c.id))
    .reduce((sum, c) => sum + c.amount, 0);
  // Count-based (not amount-based) so a 0 € bill still has to be ticked.
  const allPaidThisMonth = dueThisMonth.length > 0 && paidThisMonthCount === dueThisMonth.length;

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
              <div className="flex flex-col gap-2 md:col-span-2">
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
              <div className="flex flex-col gap-2">
                <Label htmlFor="frequency">{t('frequencyLabel')}</Label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                  <SelectTrigger id="frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((key) => (
                      <SelectItem key={key} value={key}>
                        {tFreq(key)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="dueMonth">{t('dueMonthLabel')}</Label>
                <Select value={dueMonth} onValueChange={setDueMonth}>
                  <SelectTrigger id="dueMonth">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_KEYS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {tMonths(String(n) as '1')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="paymentDay">{t('paymentDayLabel')}</Label>
                <Input
                  id="paymentDay"
                  type="number"
                  autoComplete="off"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={paymentDay}
                  onChange={(e) => setPaymentDay(e.target.value)}
                  required
                />
                <p className="text-muted-foreground text-xs">{t('paymentDayHint')}</p>
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

      <Card>
        <CardHeader>
          <CardTitle>
            {t('count', { count: charges.length })}
            {/* Explains the "19 charges vs 16/16 paid" gap: charges not due
                this month (e.g. annual bills anchored elsewhere) have no
                toggle and are excluded from the paid countdown. */}
            {dueThisMonth.length > 0 && (
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                · {t('dueCount', { due: dueThisMonth.length })}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {charges.length === 0 ? (
            <p data-testid="charges-empty-state" className="text-muted-foreground text-sm">
              {t('emptyState')}
            </p>
          ) : (
            <>
              {/* Live "reste à payer" headline — promoted to the TOP of the list
                  (dashboard-ux M2: the old bottom summary was invisible after 16
                  rows). Derived from `optimisticPaid`, so the amount counts down
                  the instant a bill is ticked. Distinct from the smoothed
                  "Effort lissé" total below (which intentionally never moves). */}
              {dueThisMonth.length > 0 && (
                <div
                  data-testid="charges-paid-summary"
                  className={`mb-4 flex items-center justify-between gap-3 rounded-lg px-4 py-3 ${
                    allPaidThisMonth ? 'bg-brand-600/10' : 'bg-surface-muted'
                  }`}
                >
                  {/* aria-live sits on the container (label + amount) with
                      aria-atomic, so screen readers announce "Reste à payer ce
                      mois 45 €" as one utterance on each tick — not the bare
                      currency value (Sourcery review). All-paid flips the banner
                      to a success state: the month's micro-reward. */}
                  <div className="min-w-0" aria-live="polite" role="status" aria-atomic="true">
                    <p
                      className={`flex items-center gap-1.5 text-xs font-medium ${
                        allPaidThisMonth ? 'text-brand-text' : 'text-muted-foreground'
                      }`}
                    >
                      {allPaidThisMonth && (
                        <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
                      )}
                      {allPaidThisMonth ? t('allPaidTitle') : t('remainingLabel')}
                    </p>
                    <p
                      data-testid="charges-remaining-amount"
                      className={`text-xl font-bold tabular-nums ${
                        allPaidThisMonth ? 'text-brand-text' : 'text-foreground'
                      }`}
                    >
                      {formatCurrency(remainingThisMonth, locale)}
                    </p>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
                    {t('paidCount', { paid: paidThisMonthCount, total: dueThisMonth.length })}
                  </span>
                </div>
              )}
              {/* One-time hint teaching the Payé toggle convention
                  (dashboard-ux F2) — shown only while there is still something
                  to tick; once the month is fully paid it is pure noise. */}
              {dueThisMonth.length > 0 && !allPaidThisMonth && (
                <p className="text-muted-foreground mb-4 text-xs" data-testid="charges-paid-hint">
                  {t('paidHint')}
                </p>
              )}
              {/* `charges-list` is now a wrapper holding one <section> per
                  non-empty frequency group. The only `listitem`s remain the
                  charge rows inside each group's <ul>, so the total count
                  still equals `charges.length` (no row hidden, no parasite
                  listitem from headings or the total footer). */}
              <div data-testid="charges-list" className="flex flex-col gap-6">
                {groups.map(({ freq, rows }) => {
                  const headingId = `charges-group-${freq}-heading`;
                  // Live per-group countdown: cash still due THIS month in this
                  // group (due-this-month rows not ticked). Derived from the
                  // optimistic paid set, so it drops the instant a bill is
                  // ticked — unlike the subtotal, which documents the group's
                  // full recurring cost and intentionally never moves.
                  const groupDue = rows.filter(
                    (c) => c.isActive && c.paymentMonths.includes(currentPeriod.month),
                  );
                  const groupRemaining = groupDue
                    .filter((c) => !optimisticPaid.has(c.id))
                    .reduce((sum, c) => sum + c.amount, 0);
                  const groupAllPaid =
                    groupDue.length > 0 && groupDue.every((c) => optimisticPaid.has(c.id));
                  return (
                    <section
                      key={freq}
                      data-testid={`charges-group-${freq}`}
                      aria-labelledby={headingId}
                    >
                      {/* Group header — neutral recurrence icon + frequency +
                          item count, adopting the cockpit "Prochaines factures"
                          card language. The subtotal moves BELOW the list
                          (validated @thierry 2026-06-04: total read after the
                          rows, coloured for impact). */}
                      <h2
                        id={headingId}
                        className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase"
                      >
                        <Repeat aria-hidden strokeWidth={1.5} className="h-4 w-4" />
                        {tFreq(freq)}
                        <span className="text-muted-foreground/70 ml-0.5 text-[11px] font-medium normal-case">
                          {t('count', { count: rows.length })}
                        </span>
                      </h2>
                      <ul
                        role="list"
                        className="border-border divide-border/60 divide-y overflow-hidden rounded-xl border"
                      >
                        {rows.map((c) => renderChargeRow(c))}
                      </ul>
                      {/* Subtotal — below the list, coloured brand for impact. */}
                      <p
                        data-testid={`charges-group-subtotal-${freq}`}
                        className="mt-2 flex items-baseline justify-end gap-1.5 px-1"
                      >
                        <span className="text-muted-foreground text-xs">{t('subtotalLabel')}</span>
                        <span className="text-brand-text text-sm font-semibold tabular-nums">
                          {formatCurrency(subtotals[freq], locale)}
                          <span className="text-muted-foreground text-xs font-normal">
                            {t(SUBTOTAL_UNIT_KEY[freq])}
                          </span>
                        </span>
                        {/* Payment state of the group's due-this-month bills:
                            live countdown while unpaid, then a persistent
                            "tout payé" check — never a silent disappearance
                            that leaves the static subtotal posing as an
                            amount still owed (@thierry 2026-07-18). */}
                        {groupAllPaid && (
                          <span
                            data-testid={`charges-group-allpaid-${freq}`}
                            className="text-brand-text inline-flex items-center gap-1 text-xs font-medium"
                          >
                            <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
                            {t('groupAllPaid')}
                          </span>
                        )}
                        {groupRemaining > 0 && (
                          <span
                            data-testid={`charges-group-remaining-${freq}`}
                            className="text-foreground text-sm font-medium tabular-nums"
                          >
                            ·{' '}
                            {t('groupRemaining', {
                              amount: formatCurrency(groupRemaining, locale),
                            })}
                          </span>
                        )}
                      </p>
                    </section>
                  );
                })}
              </div>

              {/* Global total — the headline @thierry asked for ("on ne voit
                  jamais le total des factures en bas"). The smoothed monthly
                  effort is the lead figure (consistent with the subtitle "lissée
                  sur 12 mois"); the annual equivalent is the secondary, descriptive
                  line. FSMA: both are descriptive totals, no advice, and never a
                  raw cross-cadence sum. Sits OUTSIDE every group <ul> so it
                  introduces no `listitem`. */}
              <div
                data-testid="charges-total"
                className="border-border/60 mt-6 flex flex-col gap-1 border-t pt-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-foreground text-sm font-medium">
                    {t('totalMonthlyLabel')}
                  </span>
                  <span
                    data-testid="charges-total-monthly"
                    className="text-foreground text-base font-semibold tabular-nums"
                  >
                    {formatCurrency(monthlyProvisionTotal, locale)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground text-sm">{t('totalAnnualLabel')}</span>
                  <span
                    data-testid="charges-total-annual"
                    className="text-muted-foreground text-sm tabular-nums"
                  >
                    {formatCurrency(annualTotal, locale)}
                  </span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ChargeEditDrawer charge={editingCharge} onClose={() => setEditingCharge(null)} />
    </div>
  );
}
