import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { loadAccountLedger } from '@/lib/data/operations';
import { todayIsoInBrussels } from '@/lib/data/month-situation';
import { getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
import { accountBalanceView } from '@/lib/domain/accounts/operations-view';
import { createClient } from '@/lib/supabase/server';
import { AccountsClient, type AccountBalanceProps } from './AccountsClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.accounts');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function AccountsPage() {
  const snapshot = await getWorkspaceSnapshot();
  const ledger = await loadAccountLedger(await createClient(), snapshot.workspaceId);
  const today = todayIsoInBrussels();

  // Everything the cards show is computed HERE and handed down as plain
  // numbers and ISO days: a Decimal never crosses the RSC boundary.
  const balances: AccountBalanceProps[] = snapshot.accounts.map((account) => {
    const view = accountBalanceView({
      accountType: account.accountType,
      statements: ledger.statements,
      movements: ledger.movements,
      today: new Date(`${today}T00:00:00Z`),
    });
    return {
      kind: account.kind,
      accountType: account.accountType,
      label: account.displayName ?? account.label,
      view: view && {
        readId: view.read.id,
        readBalance: view.read.balance.toNumber(),
        readStatedOn: day(view.read.statedOn),
        readIsStartingBalance: view.readIsStartingBalance,
        computed: view.computed ? view.computed.balance.toNumber() : null,
        gap: view.gap && {
          expected: view.gap.derived.toNumber(),
          read: view.gap.declared.toNumber(),
          amount: view.gap.gap.toNumber(),
        },
        reopenable: view.reopenable && {
          id: view.reopenable.id,
          statedOn: day(view.reopenable.statedOn),
        },
      },
    };
  });

  return (
    <AccountsClient
      monthlyIncome={snapshot.monthlyIncome}
      vieCouranteMonthlyTransfer={snapshot.vieCouranteMonthlyTransfer}
      balances={balances}
      ledgerFailed={!ledger.ok}
      today={today}
    />
  );
}
