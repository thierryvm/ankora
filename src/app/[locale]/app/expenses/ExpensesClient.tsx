'use client';

import { useState, useTransition } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import type { Locale } from '@/i18n/routing';
import { createExpenseAction, deleteExpenseAction } from '@/lib/actions/expenses';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import { formatCurrency, formatDate, formatMonth } from '@/lib/i18n/formatters';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

import { ExpenseEditDrawer, type ExpenseEditDrawerExpense } from './ExpenseEditDrawer';
import { resteAVivreStatus } from './reste-a-vivre';

type RawExpense = {
  id: string;
  label: string;
  amount: number;
  occurredOn: string;
  note: string | null;
};

type Props = {
  expenses: RawExpense[];
  /** Monthly « vie courante » budget (reste à vivre). */
  resteAVivre: number;
  currentYear: number;
  currentMonth: number;
  /** Days left in the current month (Europe/Brussels), for the per-day figure. */
  joursRestants: number;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpensesClient({
  expenses,
  resteAVivre,
  currentYear,
  currentMonth,
  joursRestants,
}: Props) {
  const t = useTranslations('app.expenses');
  const locale = useLocale() as Locale;
  const translateError = useActionErrorTranslator();
  const fmt = (value: Parameters<typeof formatCurrency>[0]) => formatCurrency(value, locale);

  const [isPending, startTransition] = useTransition();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState(today());
  const [editingExpense, setEditingExpense] = useState<ExpenseEditDrawerExpense | null>(null);

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
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
      } catch (err) {
        // PR-BETA-3 hotfix #3 doctrine — never swallow Next.js control flow.
        if (isNextControlFlowError(err)) throw err;
        // eslint-disable-next-line no-console
        console.error('createExpenseAction threw', err);
        toast.error(translateError('errors.expenses.createFailed'));
      }
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      try {
        const result = await deleteExpenseAction(id);
        if (result.ok) toast.success(t('toastDeleted'));
        else toast.error(translateError(result.errorCode));
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        // eslint-disable-next-line no-console
        console.error('deleteExpenseAction threw', err);
        toast.error(translateError('errors.expenses.deleteFailed'));
      }
    });
  }

  function onEdit(e: RawExpense) {
    setEditingExpense({
      id: e.id,
      label: e.label,
      amount: e.amount,
      occurredOn: e.occurredOn,
      note: e.note,
    });
  }

  // Split by the current calendar month (the reste-à-vivre budget is monthly).
  const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const thisMonth = expenses.filter((e) => e.occurredOn.startsWith(monthPrefix));
  const earlier = expenses.filter((e) => !e.occurredOn.startsWith(monthPrefix));
  const spent = thisMonth.reduce((acc, e) => acc + e.amount, 0);
  const status = resteAVivreStatus(resteAVivre, spent, joursRestants);
  const monthName = formatMonth(currentMonth, locale, 'long');
  const barAria = t('barAria', { spent: fmt(spent), budget: fmt(resteAVivre) });

  const renderRow = (e: RawExpense) => (
    <li
      key={e.id}
      data-testid={`expenses-row-${e.id}`}
      className="flex items-center justify-between gap-3 py-3"
    >
      <div className="min-w-0 flex-1">
        <p data-testid="expenses-row-label" className="truncate font-medium">
          {e.label}
        </p>
        <p data-testid="expenses-row-date" className="text-muted-foreground text-xs">
          {formatDate(e.occurredOn, locale, 'medium')}
        </p>
      </div>
      <p
        data-testid="expenses-row-amount"
        className="text-foreground shrink-0 text-sm font-semibold tabular-nums"
      >
        {fmt(e.amount)}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onEdit(e)}
        disabled={isPending}
        aria-label={t('editAria', { label: e.label })}
        data-testid={`expenses-row-edit-${e.id}`}
        className="size-11 shrink-0 md:size-9"
      >
        <Pencil className="text-muted-foreground h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onDelete(e.id)}
        disabled={isPending}
        aria-label={t('deleteAria', { label: e.label })}
        data-testid={`expenses-row-delete-${e.id}`}
        className="size-11 shrink-0 md:size-9"
      >
        <Trash2 className="text-danger h-4 w-4" />
      </Button>
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </header>

      {/* « Reste à vivre » — this month's daily-living budget minus what has
          actually been spent, with a live per-day figure (real decrement). */}
      <Card data-testid="reste-a-vivre-card">
        <CardContent className="flex flex-col gap-4 py-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-muted-foreground text-sm font-medium">
              {t('resteAVivreLabel', { month: monthName })}
            </p>
            {status.isOver && (
              <span
                className="bg-danger inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                data-testid="reste-a-vivre-over"
              >
                {t('overBudget', { amount: fmt(Math.abs(status.remaining)) })}
              </span>
            )}
          </div>
          <p
            className={`text-4xl font-bold tracking-tight tabular-nums ${
              status.isOver ? 'text-danger' : 'text-foreground'
            }`}
            data-testid="reste-a-vivre-remaining"
          >
            {fmt(status.remaining)}
          </p>
          <div
            className="bg-surface-muted h-2 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={Math.round(status.spentRatio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={barAria}
            data-testid="reste-a-vivre-bar"
          >
            <div
              className={`h-full rounded-full ${status.isOver ? 'bg-danger' : 'bg-brand-600'}`}
              style={{ width: `${status.spentRatio * 100}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">
              {t('spentOfBudget', { spent: fmt(spent), budget: fmt(resteAVivre) })}
            </span>
            {status.perDay !== null && (
              <span
                className="text-muted-foreground tabular-nums"
                data-testid="reste-a-vivre-perday"
              >
                {t('perDay', { amount: fmt(status.perDay), days: joursRestants })}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

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
          <CardTitle>{t('summary', { count: thisMonth.length, total: fmt(spent) })}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {thisMonth.length === 0 ? (
            <p data-testid="expenses-empty-state" className="text-muted-foreground text-sm">
              {t('emptyState')}
            </p>
          ) : (
            <ul role="list" data-testid="expenses-list" className="divide-border divide-y">
              {thisMonth.map(renderRow)}
            </ul>
          )}

          {earlier.length > 0 && (
            <details
              className="group border-border/60 border-t pt-3"
              data-testid="expenses-earlier"
            >
              <summary className="text-muted-foreground hover:text-foreground focus-visible:ring-brand-600 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-sm font-medium focus-visible:ring-2 focus-visible:outline-none">
                <span className="transition-transform group-open:rotate-90" aria-hidden>
                  ›
                </span>
                {t('earlierToggle', { count: earlier.length })}
              </summary>
              <ul
                role="list"
                data-testid="expenses-earlier-list"
                className="divide-border divide-y"
              >
                {earlier.map(renderRow)}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      <ExpenseEditDrawer expense={editingExpense} onClose={() => setEditingExpense(null)} />
    </div>
  );
}
