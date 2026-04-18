'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import type { Locale } from '@/i18n/routing';
import { createExpenseAction, deleteExpenseAction } from '@/lib/actions/expenses';
import { formatCurrency } from '@/lib/i18n/formatters';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

type RawExpense = {
  id: string;
  label: string;
  amount: number;
  occurredOn: string;
  note: string | null;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpensesClient({ expenses }: { expenses: RawExpense[] }) {
  const t = useTranslations('app.expenses');
  const locale = useLocale() as Locale;
  const translateError = useActionErrorTranslator();

  const [isPending, startTransition] = useTransition();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState(today());

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createExpenseAction({
        label: label.trim(),
        amount: Number(amount),
        occurredOn,
        categoryId: null,
        note: null,
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
      const result = await deleteExpenseAction(id);
      if (result.ok) toast.success(t('toastDeleted'));
      else toast.error(translateError(result.errorCode));
    });
  }

  const total = expenses.reduce((acc, e) => acc + e.amount, 0);

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
          <form onSubmit={onCreate} className="grid gap-4 md:grid-cols-3">
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
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="occurredOn">{t('dateLabel')}</Label>
              <Input
                id="occurredOn"
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
                required
              />
            </div>
            <div className="md:col-span-3">
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
          <CardTitle>
            {t('summary', { count: expenses.length, total: formatCurrency(total, locale) })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <p className="text-sm text-(--color-muted-foreground)">{t('emptyState')}</p>
          ) : (
            <ul className="divide-y divide-(--color-border)">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.label}</p>
                    <p className="text-xs text-(--color-muted-foreground)">{e.occurredOn}</p>
                  </div>
                  <p className="shrink-0 font-mono text-sm tabular-nums">
                    {formatCurrency(e.amount, locale)}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(e.id)}
                    disabled={isPending}
                    aria-label={t('deleteAria', { label: e.label })}
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
