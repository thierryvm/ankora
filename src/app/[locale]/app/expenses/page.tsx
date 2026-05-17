import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

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
  return <ExpensesClient expenses={rawExpenses} />;
}
