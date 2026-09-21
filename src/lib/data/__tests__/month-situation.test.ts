import { beforeEach, describe, expect, it, vi } from 'vitest';
import Decimal from 'decimal.js';

import type { MovementRecord } from '@/lib/domain/accounts/operations-view';
import type { AccountBalanceStatement } from '@/lib/domain/accounts/solde';

/**
 * PR D — the wiring of « Il te reste » to the operations journal.
 *
 * Two promises are held here, where the page and the ⊕ sheet read the figure:
 * a journal that cannot be read is a READ FAILURE (never a figure that silently
 * ignores every transfer), and a transfer that is in the journal reaches the
 * figure. Fictitious amounts only.
 */

const loadAccountLedger = vi.fn();

vi.mock('@/lib/data/operations', () => ({
  loadAccountLedger: (...args: unknown[]) => loadAccountLedger(...args),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('@/lib/data/commitments', () => ({
  getCommitmentsWithLedger: async () => ({ commitments: [], paidKeysByCommitment: {} }),
}));
vi.mock('@/lib/data/workspace-snapshot', () => ({
  getWorkspaceSnapshot: async () => snapshot,
  toCockpitCharges: () => [],
}));

const snapshot = {
  workspaceId: 'ws-fictif',
  monthlyIncome: 2000,
  charges: [],
  accounts: [
    { accountType: 'income_bills', balance: 0 },
    { accountType: 'provisions', balance: 0 },
    { accountType: 'daily_card', balance: 0 },
  ],
  currentMonthPayments: [],
  monthlyExpenses: [],
  currentPeriod: { year: 2026, month: 9 },
};

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const transfer = (over: Partial<MovementRecord>): MovementRecord => ({
  id: 'm-' + Math.random().toString(36).slice(2),
  kind: 'transfer',
  fromAccountType: 'income_bills',
  toAccountType: 'provisions',
  amount: new Decimal(905),
  occurredOn: day('2026-09-03'),
  recordedAt: new Date('2026-09-03T08:00:00Z'),
  cancelledAt: null,
  planYear: 2026,
  planMonth: 9,
  planSuggestedAmount: new Decimal(705),
  provisionPart: new Decimal(705),
  freeSavingsPart: new Decimal(200),
  incomeNature: null,
  description: null,
  ...over,
});

const releveQuotidien: AccountBalanceStatement = {
  id: 's-quotidien',
  accountType: 'daily_card',
  balance: new Decimal(400),
  statedOn: day('2026-09-01'),
  recordedAt: new Date('2026-09-01T08:00:00Z'),
  cancelledAt: null,
};

describe('loadMonthSituation — the journal feeds « Il te reste » (PR D)', () => {
  beforeEach(() => {
    loadAccountLedger.mockReset();
  });

  it('an unreadable journal is a read failure, never a figure without its operations', async () => {
    loadAccountLedger.mockResolvedValue({ ok: false, statements: [], movements: [] });
    const { loadMonthSituation } = await import('@/lib/data/month-situation');
    const { DataReadUnavailableError } = await import('@/lib/data/read-failure');

    await expect(loadMonthSituation()).rejects.toBeInstanceOf(DataReadUnavailableError);
  });

  it('a transfer with a free part in the journal lowers the figure by exactly that part', async () => {
    loadAccountLedger.mockResolvedValue({
      ok: true,
      statements: [releveQuotidien],
      movements: [
        transfer({}),
        transfer({
          toAccountType: 'daily_card',
          amount: new Decimal(60),
          provisionPart: null,
          freeSavingsPart: null,
          occurredOn: day('2026-09-02'),
        }),
      ],
    });
    const { loadMonthSituation } = await import('@/lib/data/month-situation');
    const out = await loadMonthSituation();

    // 2 000 − 0 retained − 200 set aside − 0 spent
    expect(out.situation.misDeCote.toFixed(2)).toBe('200.00');
    expect(out.situation.ilTeReste.toFixed(2)).toBe('1800.00');
    // The daily account: its statement (400) + the 60 transferred since.
    expect(out.soldeQuotidien?.toFixed(2)).toBe('460.00');
    // The journal read is the one of the session's workspace, never another id.
    expect(loadAccountLedger).toHaveBeenCalledWith(expect.anything(), 'ws-fictif');
  });

  it('an empty journal gives the figure of before PR D', async () => {
    loadAccountLedger.mockResolvedValue({ ok: true, statements: [], movements: [] });
    const { loadMonthSituation } = await import('@/lib/data/month-situation');
    const out = await loadMonthSituation();

    expect(out.situation.ilTeReste.toFixed(2)).toBe('2000.00');
    // No statement for the daily account: the line does not appear at all.
    expect(out.soldeQuotidien).toBeNull();
  });
});
