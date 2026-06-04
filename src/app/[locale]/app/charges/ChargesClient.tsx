'use client';

import { useMemo, useState, useTransition } from 'react';
import { Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
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
import { createChargeAction, deleteChargeAction } from '@/lib/actions/charges';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import { nextDueDateForCharge, paymentMonthsFromFrequency } from '@/lib/domain/charges';
import { formatCurrency, formatDate, formatMonth } from '@/lib/i18n/formatters';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

import { ChargeEditDrawer, type ChargeEditDrawerCharge } from './ChargeEditDrawer';

type Frequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

const MONTH_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const FREQUENCIES: readonly Frequency[] = ['monthly', 'quarterly', 'semiannual', 'annual'];

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
};

export function ChargesClient({
  charges,
  subtotals,
  monthlyProvisionTotal,
  annualTotal,
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

  const todayIso = useMemo(() => todayBrusselsIso(), []);

  // Group charges by frequency in a fixed display order. Empty buckets are
  // dropped so the list never shows a heading with no rows. The list stays
  // exhaustive — every charge is rendered (no active/inactive filter here);
  // only the money totals (server-side) skip inactive charges.
  const groups = useMemo(
    () =>
      FREQUENCIES.map((freq) => ({
        freq,
        rows: charges.filter((c) => c.frequency === freq),
      })).filter((group) => group.rows.length > 0),
    [charges],
  );

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
   * Compute the next due date label for a row.
   * Falls back to `formatMonth(dueMonth)` if `nextDueDateForCharge` returns
   * null (inactive charge or empty paymentMonths from legacy data).
   */
  function nextDueLabel(c: RawCharge): string {
    const iso = nextDueDateForCharge(
      {
        isActive: c.isActive,
        paymentMonths: c.paymentMonths,
        paymentDay: c.paymentDay,
      } as Parameters<typeof nextDueDateForCharge>[0],
      todayIso,
    );
    if (iso) return formatDate(iso, locale, 'medium');
    return formatMonth(c.dueMonth, locale, 'long');
  }

  /**
   * Render a single charge row. Mobile: a flat two-line row separated from its
   * neighbours by the group `<ul>`'s `divide-y` (no card chrome). Desktop:
   * `md:grid` projects the cells onto a 6-column baseline-aligned row via
   * `md:contents`. The edit/delete buttons stay absolute top-right on mobile
   * (`pr-24` reserves their space) and become inline cells 5/6 on desktop.
   */
  function renderChargeRow(c: RawCharge) {
    return (
      <li
        key={c.id}
        data-testid={`charges-row-${c.id}`}
        // `min-h-13` (52px) guarantees the row is always at least as tall as the
        // absolute edit/delete buttons (top-2 + size-11 = 52px) now that the
        // card padding (`p-4`) is gone — prevents the tap targets overflowing
        // onto the next row on very short content (mobile-ios-auditor F3).
        className="md:hover:bg-surface-muted relative min-h-13 px-3 py-3 pr-24 transition-colors md:grid md:min-h-0 md:grid-cols-[minmax(8rem,10rem)_minmax(0,1fr)_4.5rem_7rem_auto_auto] md:items-baseline md:gap-4 md:px-4 md:py-3 md:pr-2"
      >
        {/* Mobile: header row (next-due + amount on a single line).
            Desktop: contents — projects next-due + amount as grid cells 1 / 4. */}
        <div className="flex items-baseline justify-between gap-3 md:contents">
          <span
            data-testid="charges-row-next-due"
            className="text-muted-foreground text-xs font-medium tracking-wide md:order-1 md:text-sm"
          >
            {nextDueLabel(c)}
          </span>
          <span
            data-testid="charges-row-amount"
            className="text-foreground shrink-0 text-base font-semibold tabular-nums md:order-4 md:text-right md:text-sm md:font-medium"
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

        {/* Edit + Delete: stacked top-right tap targets on mobile,
            inline cells 5 / 6 on desktop. */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onEdit(c)}
          disabled={isPending}
          aria-label={t('editAria', { label: c.label })}
          data-testid={`charges-row-edit-${c.id}`}
          className="absolute top-2 right-14 size-11 shrink-0 md:static md:order-5 md:size-9 md:self-center"
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
          className="absolute top-2 right-2 size-11 shrink-0 md:static md:order-6 md:size-9 md:self-center"
        >
          <Trash2 className="text-danger h-4 w-4" />
        </Button>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('addFormTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="label">{t('labelLabel')}</Label>
              <Input
                id="label"
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

      <Card>
        <CardHeader>
          <CardTitle>{t('count', { count: charges.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {charges.length === 0 ? (
            <p data-testid="charges-empty-state" className="text-muted-foreground text-sm">
              {t('emptyState')}
            </p>
          ) : (
            <>
              {/* `charges-list` is now a wrapper holding one <section> per
                  non-empty frequency group. The only `listitem`s remain the
                  charge rows inside each group's <ul>, so the total count
                  still equals `charges.length` (no row hidden, no parasite
                  listitem from headings or the total footer). */}
              <div data-testid="charges-list" className="flex flex-col gap-6">
                {groups.map(({ freq, rows }) => {
                  const headingId = `charges-group-${freq}-heading`;
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
                        <span className="text-brand-700 text-sm font-semibold tabular-nums">
                          {formatCurrency(subtotals[freq], locale)}
                        </span>
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
