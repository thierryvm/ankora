'use client';

import { useState, useTransition } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { AddExpenseSheet } from '@/components/expenses/AddExpenseSheet';
import { CategoriesCard, type CategorieCarte } from '@/components/expenses/CategoriesCard';
import { MergeCategoriesSheet } from '@/components/expenses/MergeCategoriesSheet';
import type { Locale } from '@/i18n/routing';
import { deleteExpenseAction } from '@/lib/actions/expenses';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import { groupExpensesByDescription } from '@/lib/domain/expenses/group-by-description';
import { formatCurrency, formatDate, formatMonth } from '@/lib/i18n/formatters';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

import type { AccountKind } from '@/lib/domain/types';

import { ExpenseEditDrawer, type ExpenseEditDrawerExpense } from './ExpenseEditDrawer';

type RawExpense = {
  id: string;
  label: string;
  amount: number;
  occurredOn: string;
  note: string | null;
  paidFrom: AccountKind;
};

type Props = {
  /**
   * The current month COMPLETE (from `monthlyExpenses`, uncapped), plus the
   * most recent rows of earlier months. The current month has to be complete:
   * it is grouped by description below, and those groups decompose the month
   * total (rule 10) — a capped list would make them add up to less than it.
   */
  expenses: RawExpense[];
  /**
   * AUTHORITATIVE total spent this month, summed server-side from the COMPLETE
   * (unlimited) `monthlyExpenses` — never derived from `expenses` on this side
   * (Sourcery #242).
   */
  spentThisMonth: number;
  currentYear: number;
  currentMonth: number;
  /** Days elapsed in the current month, including today. */
  joursEcoules: number;
  /**
   * ADR-047 — the days of the budget month, formatted, when it is not the
   * calendar month (« du 28 septembre au 27 octobre »). `expenses` then starts
   * with that month's rows, known by id from `monthIds`.
   */
  periodeBudget?: { debut: string; fin: string } | null;
  /**
   * The ids of the budget month's rows — the rows summed into `spentThisMonth`.
   * Absent: the calendar month of `currentYear`/`currentMonth`.
   */
  monthIds?: readonly string[];
  /** The month by category, computed on the server (`categoriesDuMois`). */
  categoryGroups: ReadonlyArray<CategorieCarte>;
  /** The workspace's accounts, for the « Depuis » chips and the row line (rule 25). */
  accounts: { kind: AccountKind; label: string }[];
};

export function ExpensesClient({
  expenses,
  spentThisMonth,
  currentYear,
  currentMonth,
  joursEcoules,
  periodeBudget = null,
  monthIds,
  categoryGroups,
  accounts,
}: Props) {
  const t = useTranslations('app.expenses');
  const locale = useLocale() as Locale;
  const translateError = useActionErrorTranslator();
  const fmt = (value: Parameters<typeof formatCurrency>[0]) => formatCurrency(value, locale);

  const [isPending, startTransition] = useTransition();
  const [editingExpense, setEditingExpense] = useState<ExpenseEditDrawerExpense | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);

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
      paidFrom: e.paidFrom,
    });
  }

  // Split the list for DISPLAY by the current calendar month (complete for the
  // current month, capped for earlier ones — see `Props.expenses`). The per-day
  // figure below never uses these sums — it uses the authoritative
  // `spentThisMonth` (complete, server-side).
  //
  // ADR-047 — the budget month is ranged on the server
  // (`depensesDuMoisDeBudget`); its rows are exactly the ones summed into
  // `spentThisMonth`, known by id: a 29 September row can belong to October.
  const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const idsDuMois = monthIds ? new Set(monthIds) : null;
  const duMois = (e: RawExpense) =>
    idsDuMois ? idsDuMois.has(e.id) : e.occurredOn.startsWith(monthPrefix);
  const thisMonth = expenses.filter(duMois);
  const earlier = expenses.filter((e) => !duMois(e));
  // « Where did it go? » — the month by description, largest subtotal first.
  // Each group is one line of the month total's decomposition (rule 10).
  const groups = groupExpensesByDescription(thisMonth);
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
          {/* « Vie courante » is the default every expense starts on: only
              another account is worth a line (rule 25). */}
          {e.paidFrom !== 'vie_courante' && (
            <span
              data-testid="expenses-row-paid-from"
              className="text-muted-foreground block text-xs"
            >
              {t('rowPaidFrom', {
                account: accounts.find((a) => a.kind === e.paidFrom)?.label ?? e.paidFrom,
              })}
            </span>
          )}
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
        {periodeBudget && (
          <p data-testid="expenses-budget-period" className="text-muted-foreground mt-1 text-sm">
            {t('budgetPeriod', { debut: periodeBudget.debut, fin: periodeBudget.fin })}
          </p>
        )}
      </header>

      {/* « Catégories » (G-cat) — replaces « Dépensé ce mois »: the same
          authoritative server-side total, the « ≈ X / day » line under it, and
          the total opening category by category (COUVERTURE-v3, D2). */}
      <CategoriesCard
        total={spentThisMonth}
        parJour={perDayEcoule}
        joursEcoules={joursEcoules}
        month={currentMonth}
        groupes={categoryGroups}
      />
      {/* Shops become descriptions, the category becomes the post: the card
          then speaks of « Courses », which opens on Intermarché and Colruyt. */}
      <div className="-mt-4 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          data-testid="merge-ouvrir"
          className="min-h-11"
          onClick={() => setIsMergeOpen(true)}
        >
          {t('mergeOpen')}
        </Button>
      </div>
      {isMergeOpen && <MergeCategoriesSheet open onClose={() => setIsMergeOpen(false)} />}

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
            <ul role="list" data-testid="expenses-list" className="flex flex-col gap-4">
              {groups.map((group) => (
                <li
                  key={group.key}
                  data-testid="expense-group"
                  // Whole cents, so a probe can add the groups up without
                  // parsing a formatted amount. Set on EVERY group, a group of
                  // one included: the sum of these is the month total.
                  data-sous-total={group.subtotal.times(100).toDecimalPlaces(0).toNumber()}
                >
                  {/*
                    A group of one expense is a plain row: its title would
                    repeat the row's description, and its subtotal the row's
                    amount. The title earns its place from two rows up, where
                    the subtotal says something no single row does.
                  */}
                  {group.items.length > 1 && (
                    <h4 className="border-border flex items-baseline justify-between gap-3 border-b pb-1 text-sm font-semibold">
                      <span data-testid="expense-group-label" className="min-w-0 truncate">
                        {group.label}
                      </span>
                      <span data-testid="expense-group-subtotal" className="shrink-0 tabular-nums">
                        {fmt(group.subtotal.toNumber())}
                      </span>
                    </h4>
                  )}
                  <ul role="list" className="divide-border divide-y">
                    {group.items.map(renderRow)}
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

      <ExpenseEditDrawer
        expense={editingExpense}
        accounts={accounts}
        onClose={() => setEditingExpense(null)}
      />
      <AddExpenseSheet open={isAddOpen} onClose={() => setIsAddOpen(false)} />
    </div>
  );
}
