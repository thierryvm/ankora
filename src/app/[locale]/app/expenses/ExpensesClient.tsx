'use client';

import { useState, useTransition } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { AddExpenseSheet } from '@/components/expenses/AddExpenseSheet';
import { CHIP_DOT } from '@/components/expenses/category-dot';
import type { CategoryBreakdown } from '@/lib/domain/expenses/descriptions';
import type { Locale } from '@/i18n/routing';
import { deleteExpenseAction } from '@/lib/actions/expenses';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import { formatCurrency, formatDate, formatMonth } from '@/lib/i18n/formatters';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

import { ExpenseEditDrawer, type ExpenseEditDrawerExpense } from './ExpenseEditDrawer';

type RawExpense = {
  id: string;
  label: string;
  amount: number;
  occurredOn: string;
  note: string | null;
  /** Shown under the description when it says something else (rule 26). */
  categoryName?: string | null;
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
  /**
   * The month total by category, then by description — built server-side from
   * the same complete source as `spentThisMonth` (rule 10).
   */
  breakdown?: CategoryBreakdown[];
};

export function ExpensesClient({
  expenses,
  spentThisMonth,
  currentYear,
  currentMonth,
  joursEcoules,
  breakdown = [],
}: Props) {
  const t = useTranslations('app.expenses');
  const locale = useLocale() as Locale;
  const translateError = useActionErrorTranslator();
  const fmt = (value: Parameters<typeof formatCurrency>[0]) => formatCurrency(value, locale);

  const [isPending, startTransition] = useTransition();
  const [editingExpense, setEditingExpense] = useState<ExpenseEditDrawerExpense | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

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

  /** The month's rows by day, newest day first; the order inside a day is kept. */
  const byDay = (rows: RawExpense[]): [string, RawExpense[]][] => {
    const days = new Map<string, RawExpense[]>();
    for (const row of rows) days.set(row.occurredOn, [...(days.get(row.occurredOn) ?? []), row]);
    return [...days.entries()].sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));
  };

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
            {e.categoryName && e.categoryName.trim().toLowerCase() !== e.label.trim().toLowerCase()
              ? ` · ${e.categoryName}`
              : ''}
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

      {/*
        The inline add form is gone, replaced by the shared entry sheet.

        It carried `categoryId: null` hardcoded — two lines of UI that
        disconnected a table, a foreign key and an Accepted ADR (ADR-022) from
        the product. The fix is not to teach this form about categories: it is
        to stop having two entry paths. One flow, one implementation, one place
        where the 2-tap promise and the « Il te restera X € » projection live.

        Kept as a full-width button rather than only the ⊕: this button is
        visible on desktop, where the bottom tab bar is not rendered at all
        (`md:hidden`). Without it the expense page would have no way to add one
        above 768 px. Desktop gets its proper treatment in the next chantier;
        this is the floor, not the design.
      */}
      <Button
        type="button"
        size="lg"
        onClick={() => setIsAddOpen(true)}
        data-testid="expenses-open-add-sheet"
        className="self-start"
      >
        <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        {t('addButton')}
      </Button>

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
          {/*
            Rule 10 — the total opens on what makes it. Each category is a
            native <details>: keyboard and screen reader for free, nothing to
            re-implement. Inside, one group per description, largest first,
            « Sans libellé » last (rule 26): the subtotals add up to the
            category, the categories to the month, to the cent — the domain
            sums in cents.
          */}
          {breakdown.length > 0 && (
            <ul
              role="list"
              data-testid="depense-mois-categories"
              className="divide-border divide-y"
            >
              {breakdown.map((category) => (
                <li key={category.categoryId ?? 'none'}>
                  <details
                    className="group"
                    data-testid="depense-categorie"
                    data-total={Math.round(category.total * 100)}
                  >
                    <summary className="hover:bg-muted focus-visible:ring-brand-600 flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-md px-2 py-2 focus-visible:ring-2 focus-visible:outline-none">
                      <span
                        aria-hidden="true"
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          CHIP_DOT[category.colorToken ?? 'zinc'] ?? CHIP_DOT.zinc
                        }`}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {category.name ?? t('noCategory')}
                      </span>
                      <span className="text-sm font-semibold tabular-nums">
                        {fmt(category.total)}
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-muted-foreground transition-transform group-open:rotate-90"
                      >
                        ›
                      </span>
                    </summary>
                    <div className="flex flex-col gap-3 py-2 pl-7">
                      {category.groups.map((group) => (
                        <div key={group.label ?? ''} data-testid="depense-groupe">
                          <h3
                            className="flex items-baseline justify-between gap-3 text-sm font-medium"
                            data-libelle-groupe={group.label ?? ''}
                            data-sous-total={Math.round(group.total * 100)}
                          >
                            <span className="min-w-0 truncate">
                              {group.label ?? t('noDescription')}
                            </span>
                            <span className="tabular-nums">{fmt(group.total)}</span>
                          </h3>
                          <ul role="list" className="text-muted-foreground text-xs">
                            {group.lines.map((line) => (
                              <li key={line.id} className="flex justify-between gap-3 py-0.5">
                                <span>{formatDate(line.occurredOn, locale, 'medium')}</span>
                                <span className="tabular-nums">{fmt(line.amount)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
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
            <ul role="list" data-testid="expenses-list" className="flex flex-col gap-3">
              {byDay(thisMonth).map(([day, rows]) => (
                <li key={day} data-testid="expenses-day">
                  <h3 className="text-muted-foreground px-2 text-xs font-semibold tracking-[0.09em] uppercase">
                    {formatDate(day, locale, 'long')}
                  </h3>
                  <ul role="list" className="divide-border divide-y">
                    {rows.map(renderRow)}
                  </ul>
                </li>
              ))}
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
      <AddExpenseSheet open={isAddOpen} onClose={() => setIsAddOpen(false)} />
    </div>
  );
}
