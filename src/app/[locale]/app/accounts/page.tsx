import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { loadAccountLedger } from '@/lib/data/operations';
import { todayIsoInBrussels } from '@/lib/data/month-situation';
import { getSnapshotWith } from '@/lib/data/workspace-snapshot';
import { moisConcerneDe, moisServisParRevenu } from '@/lib/domain/accounts/mois-concerne';
import { accountBalanceView } from '@/lib/domain/accounts/operations-view';
import { createClient } from '@/lib/supabase/server';
import { AccountsClient, type AccountBalanceProps } from './AccountsClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.accounts');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function AccountsPage() {
  const [snapshot, ledger] = await getSnapshotWith('/app/accounts', async (workspaceId) =>
    loadAccountLedger(await createClient(), workspaceId),
  );
  const today = todayIsoInBrussels();

  // Everything the cards show is computed HERE and handed down as plain
  // numbers and ISO days: a Decimal never crosses the RSC boundary.
  // The month's « argent reçu » per account (Brussels month), cancelled ones
  // included so each line can offer its reopening.
  const month = today.slice(0, 7);
  // Written this month counts too: money received dated last month but written
  // today must stay on screen, where it can be cancelled (rule 11).
  const brusselsMonth = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(d).slice(0, 7);
  const countsIn = (m: (typeof ledger.movements)[number]) => {
    const p = moisConcerneDe(m);
    return `${p.year}-${String(p.month).padStart(2, '0')}`;
  };
  const incomesOf = (accountType: string) =>
    ledger.movements
      .filter(
        (m) =>
          m.kind === 'income' &&
          m.toAccountType === accountType &&
          (day(m.occurredOn).slice(0, 7) === month ||
            brusselsMonth(m.recordedAt) === month ||
            // ADR-046 — an income counted in this month's budget stays
            // visible (and cancellable) here, whatever its date (rule 10/11).
            countsIn(m) === month),
      )
      .sort(
        (a, b) =>
          b.occurredOn.getTime() - a.occurredOn.getTime() ||
          b.recordedAt.getTime() - a.recordedAt.getTime(),
      )
      .map((m) => ({
        id: m.id,
        amount: m.amount.toNumber(),
        occurredOn: day(m.occurredOn),
        description: m.description,
        cancelled: m.cancelledAt !== null,
        // ADR-046 — only when it says something the date does not.
        countsFor:
          m.budgetYear !== null && m.budgetMonth !== null
            ? `${m.budgetYear}-${String(m.budgetMonth).padStart(2, '0')}`
            : null,
      }));

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
      incomes: incomesOf(account.accountType),
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
      moisServis={moisServisParRevenu(ledger.movements)}
      ledgerFailed={!ledger.ok}
      today={today}
    />
  );
}
