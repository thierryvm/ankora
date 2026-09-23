import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Expenses } from '@/lib/domain';
import { getCategories } from '@/lib/data/categories';
import { getExpenses, getSnapshotWith } from '@/lib/data/workspace-snapshot';
import { breakdownByCategory } from '@/lib/domain/expenses/descriptions';
import { ExpensesClient } from './ExpensesClient';

// PR-D5 i18n: was a hardcoded FR string. See `charges/page.tsx`.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.expenses');
  return { title: t('title') };
}

export default async function ExpensesPage() {
  const [snapshot, [expenses, categories]] = await getSnapshotWith('/app/expenses', (workspaceId) =>
    Promise.all([getExpenses(workspaceId), getCategories(workspaceId)]),
  );
  const categoryNames = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const rawExpenses = expenses.map((e) => ({
    id: e.id,
    label: e.label,
    amount: e.amount.toNumber(),
    occurredOn: e.occurredOn,
    note: e.note,
    categoryName: e.categoryId ? (categoryNames[e.categoryId] ?? null) : null,
  }));

  // Days left in the current month (Europe/Brussels) for the per-day figure —
  // same TZ the snapshot derives `currentPeriod` from, so `bDay` is in-month.
  const { year, month } = snapshot.currentPeriod;
  const [, , bDay] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .split('-')
    .map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const joursEcoules = Math.min(daysInMonth, Math.max(1, bDay ?? 1));

  // Authoritative current-month spend: summed from `monthlyExpenses` (complete,
  // no 50-row cap) so the figure never under-reports (Sourcery #242).
  const spentThisMonth = Expenses.totalAmount(snapshot.monthlyExpenses).toNumber();

  // Rule 10 — the month total opens on what makes it: per category, then per
  // description. From the same complete source as the total, so the parts can
  // never disagree with the sum.
  const breakdown = breakdownByCategory(
    snapshot.monthlyExpenses.map((e) => ({
      id: e.id,
      label: e.label,
      amount: e.amount.toNumber(),
      occurredOn: e.occurredOn,
      categoryId: e.categoryId,
    })),
    categories,
  );

  return (
    <ExpensesClient
      expenses={rawExpenses}
      spentThisMonth={spentThisMonth}
      currentYear={year}
      currentMonth={month}
      joursEcoules={joursEcoules}
      breakdown={breakdown}
    />
  );
}
