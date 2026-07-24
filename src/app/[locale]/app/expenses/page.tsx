import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Expenses } from '@/lib/domain';
import { getExpenses, getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
import { ExpensesClient } from './ExpensesClient';

// PR-D5 i18n: was a hardcoded FR string. See `charges/page.tsx`.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.expenses');
  return { title: t('title') };
}

export default async function ExpensesPage() {
  const snapshot = await getWorkspaceSnapshot();
  const expenses = await getExpenses(snapshot.workspaceId);
  const rawExpenses = expenses.map((e) => ({
    id: e.id,
    label: e.label,
    amount: e.amount.toNumber(),
    occurredOn: e.occurredOn,
    note: e.note,
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
  const joursRestants = Math.max(1, daysInMonth - (bDay ?? 1) + 1);

  // Authoritative current-month spend: summed from `monthlyExpenses` (complete,
  // no 50-row cap) so the reste-à-vivre widget never under-reports (Sourcery #242).
  const spentThisMonth = Expenses.totalAmount(snapshot.monthlyExpenses).toNumber();

  return (
    <ExpensesClient
      expenses={rawExpenses}
      resteAVivre={snapshot.resteAVivre}
      spentThisMonth={spentThisMonth}
      currentYear={year}
      currentMonth={month}
      joursRestants={joursRestants}
    />
  );
}
