import type { Metadata } from 'next';

import { getExpenses, getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
import { ExpensesClient } from './ExpensesClient';

export const metadata: Metadata = { title: 'Mes dépenses' };

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
  return <ExpensesClient expenses={rawExpenses} />;
}
