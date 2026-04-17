import type { Metadata } from 'next';

import { getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
import { AccountsClient } from './AccountsClient';

export const metadata: Metadata = {
  title: 'Mes comptes',
  description:
    'Suis les soldes de tes comptes Principal, Vie Courante et Épargne. Règle ton revenu mensuel et ton virement vers Vie Courante.',
};

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
