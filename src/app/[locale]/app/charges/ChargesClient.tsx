'use client';

import { useMemo, useState, useTransition } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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

export function ChargesClient({ charges }: { charges: RawCharge[] }) {
  const t = useTranslations('app.charges');
  const tFreq = useTranslations('common.frequency');
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
            <ul
              role="list"
              data-testid="charges-list"
              className="md:divide-border/40 flex flex-col gap-3 md:flex-none md:gap-0 md:divide-y"
            >
              {charges.map((c) => (
                <li
                  key={c.id}
                  data-testid={`charges-row-${c.id}`}
                  className="bg-card border-border/60 md:hover:bg-surface-muted relative rounded-lg border p-4 pr-24 transition-colors md:grid md:grid-cols-[minmax(8rem,10rem)_minmax(0,1fr)_auto_auto_auto_auto] md:items-baseline md:gap-4 md:rounded-none md:border-0 md:bg-transparent md:px-2 md:py-3 md:pr-2"
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
                    <span
                      data-testid="charges-row-frequency"
                      className="bg-surface-muted text-muted-foreground inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium md:order-3"
                    >
                      {tFreq(c.frequency as Frequency)}
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
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ChargeEditDrawer charge={editingCharge} onClose={() => setEditingCharge(null)} />
    </div>
  );
}
