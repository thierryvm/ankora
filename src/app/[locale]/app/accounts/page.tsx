import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
import { AccountsClient } from './AccountsClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.accounts');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default async function AccountsPage() {
  const snapshot = await getWorkspaceSnapshot();

  return (
    <AccountsClient
      monthlyIncome={snapshot.monthlyIncome}
      vieCouranteMonthlyTransfer={snapshot.vieCouranteMonthlyTransfer}
      accounts={snapshot.accounts}
    />
  );
}
