'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
import { createChargeAction, deleteChargeAction } from '@/lib/actions/charges';
import { formatMoney } from '@/lib/format';
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
        <p className="mt-1 text-(--color-muted-foreground)">{t('subtitle')}</p>
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
            <p className="text-sm text-(--color-muted-foreground)">{t('emptyState')}</p>
          ) : (
            <ul className="divide-y divide-(--color-border)">
              {charges.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.label}</p>
                    <p className="text-xs text-(--color-muted-foreground)">
                      {t('referenceFormat', {
                        frequency: tFreq(c.frequency as Frequency),
                        month: tMonths(String(c.dueMonth) as '1'),
                      })}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-sm tabular-nums">{formatMoney(c.amount)}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(c.id)}
                    disabled={isPending}
                    aria-label={t('deleteAria', { label: c.label })}
                  >
                    <Trash2 className="h-4 w-4 text-(--color-danger)" />
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
