'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
import { formatCurrency, formatMonth } from '@/lib/i18n/formatters';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

type Frequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

const MONTH_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const FREQUENCIES: readonly Frequency[] = ['monthly', 'quarterly', 'semiannual', 'annual'];

type RawCharge = {
  id: string;
  label: string;
  amount: number;
  frequency: string;
  dueMonth: number;
  categoryId: string | null;
  isActive: boolean;
  notes: string | null;
};

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

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createChargeAction({
        label: label.trim(),
        amount: Number(amount),
        frequency,
        dueMonth: Number(dueMonth),
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
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      const result = await deleteChargeAction(id);
      if (result.ok) {
        toast.success(t('toastDeleted'));
      } else {
        toast.error(translateError(result.errorCode));
      }
    });
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
            <p className="text-muted-foreground text-sm">{t('emptyState')}</p>
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
                  className="bg-card border-border/60 md:hover:bg-surface-muted relative rounded-lg border p-4 pr-14 transition-colors md:grid md:grid-cols-[5rem_minmax(0,1fr)_auto_auto_auto] md:items-baseline md:gap-4 md:rounded-none md:border-0 md:bg-transparent md:px-2 md:py-3 md:pr-2"
                >
                  {/* Mobile: header row (month + amount on a single line, justify-between).
                      Desktop: contents — projects month + amount as direct grid children. */}
                  <div className="flex items-baseline justify-between gap-3 md:contents">
                    <span
                      data-testid="charges-row-month"
                      className="text-muted-foreground text-xs font-medium tracking-wide uppercase md:order-1 md:text-sm"
                    >
                      {formatMonth(c.dueMonth, locale, 'short')}
                    </span>
                    <span
                      data-testid="charges-row-amount"
                      className="text-foreground shrink-0 text-base font-semibold tabular-nums md:order-4 md:text-right md:text-sm md:font-medium"
                    >
                      {formatCurrency(c.amount, locale)}
                    </span>
                  </div>

                  {/* Mobile: body row (label + frequency chip, flex gap-2 mt-2).
                      Desktop: contents — projects label + chip as cells 2 and 3. */}
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

                  {/* Delete: top-right tap target on mobile (44×44), inline cell 5 on desktop (36×36). */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(c.id)}
                    disabled={isPending}
                    aria-label={t('deleteAria', { label: c.label })}
                    className="absolute top-2 right-2 size-11 shrink-0 md:static md:order-5 md:size-9 md:self-center"
                  >
                    <Trash2 className="text-danger h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
