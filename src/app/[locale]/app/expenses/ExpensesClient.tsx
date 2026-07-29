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
import { todayInAnkoraTz } from '@/lib/date/tz';

type RawExpense = {
  id: string;
  label: string;
  amount: number;
  occurredOn: string;
  note: string | null;
};

type Props = {
  expenses: RawExpense[];
  /**
   * AUTHORITATIVE total spent this month, summed server-side from the COMPLETE
   * (unlimited) `monthlyExpenses`. The `expenses` list is capped at 50 rows, so
   * the month total MUST NOT be derived from it — past the 51st
   * current-month expense it would under-report the spend
   * (a lie about the user's money). Sourcery #242.
   */
  spentThisMonth: number;
  currentYear: number;
  currentMonth: number;
  /** Days elapsed in the current month, including today. */
  joursEcoules: number;
};

export function ExpensesClient({
  expenses,
  spentThisMonth,
  currentYear,
  currentMonth,
  joursEcoules,
}: Props) {
  const t = useTranslations('app.expenses');
  const locale = useLocale() as Locale;
  const translateError = useActionErrorTranslator();
  const fmt = (value: Parameters<typeof formatCurrency>[0]) => formatCurrency(value, locale);

  const [isPending, startTransition] = useTransition();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState(todayInAnkoraTz());
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

  // Split the (capped) list for DISPLAY by the current calendar month. The
  // per-day figure below never uses these sums — it uses the authoritative
  // `spentThisMonth` (complete, server-side) so pagination cannot skew the money.
  const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const thisMonth = expenses.filter((e) => e.occurredOn.startsWith(monthPrefix));
  const earlier = expenses.filter((e) => !e.occurredOn.startsWith(monthPrefix));
  const monthName = formatMonth(currentMonth, locale, 'long');
  // ADR-035 — average daily spend so far. Replaces the former progress bar,
  // which measured spending against `reste_a_vivre_default`: a 500 € constant
  // most users never chose. A bar needs a denominator, and there is no honest
  // one here any more — so the page states what actually happened instead of
  // scoring it against an invented target. "What is left" is the hero's job.
  const perDayEcoule = joursEcoules > 0 ? spentThisMonth / joursEcoules : null;

  const renderRow = (e: RawExpense) => (
    <li key={e.id} data-testid={`expenses-row-${e.id}`}>
      {/*
        The whole row is the target, not a muted pencil next to a red bin.

        The drawer has always worked, but its trigger was a
        `text-muted-foreground` Pencil sitting beside a `text-danger` Trash —
        the eye goes to the red one, and @thierry spent weeks believing
        expenses could not be edited at all.

        A real <button> rather than an onClick on the <li>: it keeps keyboard
        focus, the accessible name and the 44 px target, and nothing
        interactive is nested inside it.

        Deleting moves into the drawer. An irreversible action one stray tap
        away in a scrolling list, with no confirmation, was the more dangerous
        half of the same layout.
      */}
      <button
        type="button"
        onClick={() => onEdit(e)}
        disabled={isPending}
        aria-label={t('editAria', { label: e.label })}
        data-testid={`expenses-row-edit-${e.id}`}
        className="hover:bg-muted focus-visible:ring-brand-600 flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-progress"
      >
        <span className="min-w-0 flex-1">
          <span data-testid="expenses-row-label" className="block truncate font-medium">
            {e.label}
          </span>
          <span data-testid="expenses-row-date" className="text-muted-foreground block text-xs">
            {formatDate(e.occurredOn, locale, 'medium')}
          </span>
        </span>
        <span
          data-testid="expenses-row-amount"
          className="text-foreground shrink-0 text-sm font-semibold tabular-nums"
        >
          {fmt(e.amount)}
        </span>
        <Pencil className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </header>

      {/* « Dépensé ce mois » — the authoritative server-side total, with the
          average daily rate so far. No budget, no bar: ADR-035 removed the
          envelope this used to be measured against. */}
      <Card data-testid="depense-mois-card">
        <CardContent className="flex flex-col gap-4 py-6">
          {/* Real <h2> (not a <p>) so screen-reader heading navigation has a
              landmark for this section — the page otherwise has only the h1. */}
          <h2 className="text-muted-foreground text-sm font-medium">
            {t('depenseMoisLabel', { month: monthName })}
          </h2>
          <p
            className="text-foreground text-4xl font-bold tracking-tight tabular-nums"
            data-testid="depense-mois-total"
          >
            {fmt(spentThisMonth)}
          </p>
          {perDayEcoule !== null && (
            <p
              className="text-muted-foreground text-xs tabular-nums"
              data-testid="depense-mois-perday"
            >
              {t('perDayElapsed', { amount: fmt(perDayEcoule), days: joursEcoules })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Add form stays ALWAYS visible (unlike ChargesClient, which collapses
          it): logging a daily expense is a frequent, quick action — the whole
          point of a « vie courante » tracker — so it earns permanent screen
          real estate. Deliberate cross-page divergence, not an oversight. */}
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
            {t('summary', { count: thisMonth.length, total: fmt(spentThisMonth) })}
          </CardTitle>
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
