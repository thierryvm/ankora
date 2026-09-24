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
const readMonthActivity = vi.fn();

vi.mock('@/lib/data/operations', () => ({
  loadAccountLedger: (...args: unknown[]) => loadAccountLedger(...args),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
const commitmentsRead = vi.fn(() => ({ commitments: [] as unknown[], paidKeysByCommitment: {} }));
vi.mock('@/lib/data/commitments', () => ({
  getCommitmentsWithLedger: async () => commitmentsRead(),
}));
vi.mock('@/lib/data/workspace-snapshot', () => ({
  getWorkspaceSnapshot: async () => snapshot,
  getSnapshotWith: async (_route: unknown, read: (workspaceId: string) => Promise<unknown>) => [
    snapshot,
    await read(snapshot.workspaceId),
  ],
  readMonthActivity: (...args: unknown[]) => readMonthActivity(...args),
  // Same projection as production (a field-for-field copy): the viewed-month
  // test below needs REAL bills to reach the figure, not an empty list.
  toCockpitCharges: (charges: readonly Record<string, unknown>[]) =>
    charges.map((c) => ({
      id: c.id,
      label: c.label,
      amount: c.amount,
      frequency: c.frequency,
      paymentMonths: c.paymentMonths,
      paymentDay: c.paymentDay,
      isActive: c.isActive,
    })),
}));

const snapshot = {
  workspaceId: 'ws-fictif',
  monthlyIncome: 2000,
  charges: [] as Record<string, unknown>[],
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
  budgetYear: null,
  budgetMonth: null,
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

/**
 * Lot 2 of ADR-046 — the cockpit follows the chosen month. The figure reads
 * the VIEWED month's bills paid, spending and operations; nothing is computed
 * anew, only the month the same functions receive changes.
 */
describe('loadMonthSituation — the viewed month (ADR-046, lot 2)', () => {
  const october = { year: 2026, month: 10 };

  /** Salary arrived on 28 September, assigned to October (ADR-046). */
  const salairePourOctobre = transfer({
    kind: 'income',
    fromAccountType: null,
    toAccountType: 'income_bills',
    amount: new Decimal(2505),
    occurredOn: day('2026-09-28'),
    planYear: null,
    planMonth: null,
    planSuggestedAmount: null,
    provisionPart: null,
    freeSavingsPart: null,
    incomeNature: 'regular',
    budgetYear: 2026,
    budgetMonth: 10,
  });

  beforeEach(() => {
    loadAccountLedger.mockReset();
    readMonthActivity.mockReset();
    readMonthActivity.mockResolvedValue({ payments: [], expenses: [] });
    snapshot.charges = [];
    commitmentsRead.mockReset();
    commitmentsRead.mockReturnValue({ commitments: [], paidKeysByCommitment: {} });
  });

  it('October with a real bill AND a commitment: both counted, the bill paid for October only', async () => {
    // Fictitious family: 505 € of monthly bills, 705 € a year of insurance
    // due in October, and a six-instalment plan of 100 € started in August.
    snapshot.charges = [
      {
        id: 'c-loyer',
        label: 'Loyer fictif',
        amount: new Decimal(505),
        frequency: 'monthly',
        paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        paymentDay: 5,
        isActive: true,
      },
      {
        id: 'c-assurance',
        label: 'Assurance fictive',
        amount: new Decimal(705),
        frequency: 'annual',
        paymentMonths: [10],
        paymentDay: 15,
        isActive: true,
      },
    ];
    commitmentsRead.mockReturnValue({
      commitments: [
        {
          id: 'k-plan',
          label: 'Échéancier fictif',
          kind: 'installment_plan',
          totalAmount: 600,
          installmentAmount: 100,
          installmentsTotal: 6,
          startYear: 2026,
          startMonth: 8,
          paymentDay: 10,
          frequency: 'monthly',
          notes: null,
          isActive: true,
          paidFrom: 'income_bills',
        },
      ],
      paidKeysByCommitment: {},
    });
    loadAccountLedger.mockResolvedValue({
      ok: true,
      statements: [],
      movements: [salairePourOctobre],
    });
    readMonthActivity.mockResolvedValue({
      payments: [{ chargeId: 'c-assurance', periodYear: 2026, periodMonth: 10 }],
      expenses: [],
    });
    const { loadMonthSituation } = await import('@/lib/data/month-situation');
    const { paymentKey } = await import('@/lib/domain/cockpit');
    const out = await loadMonthSituation(null, october);

    // Each subtracted amount opens on the bill or plan it comes from (rule 10).
    expect(out.decomposition.chargesFixes.parts.map((p) => p.libelle)).toEqual(['Loyer fictif']);
    expect(out.decomposition.lissage.parts.map((p) => p.libelle)).toEqual(['Assurance fictive']);
    expect(out.decomposition.engagements.parts.map((p) => p.libelle)).toEqual([
      'Échéancier fictif',
    ]);
    expect(out.situation.chargesFixes.toFixed(2)).toBe('505.00');
    expect(out.situation.provisionsLissees.toFixed(2)).toBe('58.75');
    expect(out.situation.engagementsMensuels.toFixed(2)).toBe('100.00');
    // Revenue counted = the salary « for October » (2 505 > 2 000 written):
    // 2 505 − 505 − 58.75 − 100 = 1 841.25.
    expect(out.situation.ilTeReste.toFixed(2)).toBe('1841.25');
    // The insurance ticked for October is paid for October, and for no other month.
    expect(out.paymentsLedger.get(paymentKey('c-assurance', 2026, 10))).toBe(true);
    expect(out.paymentsLedger.get(paymentKey('c-assurance', 2026, 9))).toBeUndefined();
  });

  it('October shows a bill of October ticked in September as paid for October', async () => {
    loadAccountLedger.mockResolvedValue({ ok: true, statements: [], movements: [] });
    readMonthActivity.mockResolvedValue({
      payments: [{ chargeId: 'c-assurance', periodYear: 2026, periodMonth: 10 }],
      expenses: [],
    });
    const { loadMonthSituation } = await import('@/lib/data/month-situation');
    const { paymentKey } = await import('@/lib/domain/cockpit');
    const out = await loadMonthSituation(null, october);

    // The month's payments are read for the VIEWED month, in the session's workspace.
    expect(readMonthActivity).toHaveBeenCalledWith('ws-fictif', october);
    expect(out.ref).toEqual(october);
    expect(out.paymentsLedger.get(paymentKey('c-assurance', 2026, 10))).toBe(true);
    expect(out.isCurrentMonth).toBe(false);
  });

  it('the salary of 28 September « for October » counts in October and not in September', async () => {
    loadAccountLedger.mockResolvedValue({
      ok: true,
      statements: [],
      movements: [salairePourOctobre],
    });
    const { loadMonthSituation } = await import('@/lib/data/month-situation');

    const oct = await loadMonthSituation(null, october);
    expect(oct.situation.revenuRecu?.toFixed(2)).toBe('2505.00');

    const sept = await loadMonthSituation(null);
    expect(sept.situation.revenuRecu).toBeNull();
    expect(sept.ref).toEqual({ year: 2026, month: 9 });
  });

  it('the spending of the viewed month is the one subtracted', async () => {
    loadAccountLedger.mockResolvedValue({ ok: true, statements: [], movements: [] });
    readMonthActivity.mockResolvedValue({
      payments: [],
      expenses: [
        {
          id: 'e-1',
          label: 'Courses',
          amount: new Decimal(55),
          occurredOn: '2026-10-03',
          categoryId: null,
          note: null,
          paidFrom: null,
        },
      ],
    });
    const { loadMonthSituation } = await import('@/lib/data/month-situation');
    const out = await loadMonthSituation(null, october);

    expect(out.situation.depensesDuMois.toFixed(2)).toBe('55.00');
    expect(out.monthlyExpenses).toHaveLength(1);
  });

  it("another month never shows today's balance of the daily account", async () => {
    loadAccountLedger.mockResolvedValue({ ok: true, statements: [releveQuotidien], movements: [] });
    const { loadMonthSituation } = await import('@/lib/data/month-situation');

    expect((await loadMonthSituation(null)).soldeQuotidien?.toFixed(2)).toBe('400.00');
    expect((await loadMonthSituation(null, october)).soldeQuotidien).toBeNull();
  });

  it('the current month reads nothing more than before', async () => {
    loadAccountLedger.mockResolvedValue({ ok: true, statements: [], movements: [] });
    const { loadMonthSituation } = await import('@/lib/data/month-situation');
    const out = await loadMonthSituation(null, { year: 2026, month: 9 });

    expect(readMonthActivity).not.toHaveBeenCalled();
    expect(out.isCurrentMonth).toBe(true);
  });
});
