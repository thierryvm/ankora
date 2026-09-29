import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown; error: { message: string } | null };
type Call = { table: string; op: string; payload?: unknown; filters: Record<string, unknown> };

const h = vi.hoisted(() => {
  const queue: Array<{ table: string; op: string; result: Result }> = [];
  const calls: Call[] = [];
  function take(table: string, op: string): Result {
    const i = queue.findIndex((q) => q.table === table && q.op === op);
    if (i === -1) throw new Error(`no scripted result for ${table}.${op}`);
    return queue.splice(i, 1)[0]!.result;
  }
  function builder(table: string) {
    const call: Call = { table, op: 'select', filters: {} };
    const b: Record<string, unknown> = {
      insert: vi.fn((p: unknown) => ((call.op = 'insert'), (call.payload = p), b)),
      update: vi.fn((p: unknown) => ((call.op = 'update'), (call.payload = p), b)),
      // ADR-045 D23 — an answer « already inside » is withdrawn by a delete.
      delete: vi.fn(() => ((call.op = 'delete'), b)),
      select: vi.fn(() => b),
      eq: vi.fn((c: string, v: unknown) => ((call.filters[c] = v), b)),
      is: vi.fn((c: string, v: unknown) => ((call.filters[c] = v), b)),
      maybeSingle: vi.fn(async () => (calls.push(call), take(table, call.op))),
      single: vi.fn(async () => (calls.push(call), take(table, call.op))),
      then: (ok: (r: Result) => unknown) => {
        calls.push(call);
        return Promise.resolve(take(table, call.op)).then(ok);
      },
    };
    return b;
  }
  return {
    queue,
    calls,
    client: { from: vi.fn((t: string) => builder(t)) },
    auth: vi.fn(async () => ({ ok: true, userId: 'user-1', workspaceId: 'ws-1' }) as unknown),
    rate: vi.fn(async () => ({ success: true })),
    audit: vi.fn(async () => {}),
    logError: vi.fn(),
    charges: vi.fn(async (): Promise<unknown[] | null> => []),
    ledger: vi.fn(async () => ({
      ok: true,
      statements: [] as unknown[],
      movements: [] as unknown[],
    })),
  };
});

vi.mock('@/lib/actions/authorized-workspace', () => ({ authorizedWorkspace: h.auth }));
vi.mock('@/lib/security/rate-limit', () => ({ rateLimit: h.rate }));
vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: {
    ACCOUNT_BALANCE_UPDATED: 'account.balance_updated',
    MOVEMENT_RECORDED: 'movement.recorded',
    MOVEMENT_CANCELLATION_SET: 'movement.cancellation_set',
  },
  logAuditEvent: h.audit,
}));
vi.mock('@/lib/log', () => ({
  log: { error: h.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));
// ADR-045 D22 — the loader also returns the debits; these cases have none.
vi.mock('@/lib/data/operations', () => ({
  loadAccountLedger: async (...args: unknown[]) => ({
    debits: [],
    ...(await (h.ledger as unknown as (...a: unknown[]) => Promise<object>)(...args)),
  }),
}));
// Tour 55 — the provisions share is recomputed from the charges on the server.
vi.mock('@/lib/data/charge-row', () => ({
  loadWorkspaceCharges: (...a: unknown[]) =>
    (h.charges as unknown as (...x: unknown[]) => Promise<unknown>)(...a),
}));
vi.mock('@/lib/data/month-situation', () => ({ todayIsoInBrussels: () => '2026-09-21' }));
vi.mock('@/lib/actions/revalidate', () => ({
  revalidateDashboard: vi.fn(),
  revalidateAppPath: vi.fn(),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) =>
    key === 'defaultRegular' ? 'Revenu du mois' : 'En plus du revenu',
}));

import { money, type Charge } from '@/lib/domain/types';
import {
  correctIncomeAmountAction,
  recordBalanceStatementAction,
  recordIncomeAction,
  recalculateTransferSplitAction,
  recordPlannedTransferAction,
  setFlowIncludedAction,
  setMovementCancelledAction,
  setStatementCancelledAction,
} from '../operations';

const ID = '10dccda9-7e0f-4b4e-9c7d-23f3c1b7e8a9';
const stmt = (balance: number, statedOn: string, cancelled = false) => ({
  id: `s-${statedOn}-${balance}`,
  accountType: 'provisions' as const,
  balance: money(balance),
  statedOn: new Date(`${statedOn}T00:00:00Z`),
  recordedAt: new Date(`${statedOn}T08:00:00Z`),
  cancelledAt: cancelled ? new Date() : null,
});
const script = (table: string, op: string, result: Result) => h.queue.push({ table, op, result });
const writes = (table: string) => h.calls.filter((c) => c.table === table && c.op !== 'select');

beforeEach(() => {
  h.queue.length = 0;
  h.calls.length = 0;
  h.auth.mockImplementation(async () => ({ ok: true, userId: 'user-1', workspaceId: 'ws-1' }));
  h.rate.mockImplementation(async () => ({ success: true }));
  h.audit.mockClear();
  h.logError.mockClear();
  h.ledger.mockImplementation(async () => ({ ok: true, statements: [], movements: [] }));
});

describe('gate — shared by every operation', () => {
  it('refuses without a session and writes nothing', async () => {
    h.auth.mockImplementation(async () => ({ ok: false, errorCode: 'errors.session.expired' }));
    const r = await recordBalanceStatementAction({
      accountType: 'provisions',
      balance: 10,
      statedOn: '2026-09-21',
    });
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.expired' });
    expect(h.calls).toHaveLength(0);
  });

  it('refuses when rate limited', async () => {
    h.rate.mockImplementation(async () => ({ success: false }));
    const r = await setMovementCancelledAction({ id: ID, cancelled: true });
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.rateLimited' });
    expect(h.calls).toHaveLength(0);
  });

  it('refuses a client-sent workspaceId instead of trusting or dropping it', async () => {
    const r = await recordPlannedTransferAction({
      fromAccountType: 'income_bills',
      toAccountType: 'daily_card',
      amount: 505,
      occurredOn: '2026-09-21',
      planYear: 2026,
      planMonth: 9,
      planSuggestedAmount: 505,
      plannedProvisions: 0,
      workspaceId: 'ws-other',
    });
    expect(r.ok).toBe(false);
    expect(h.calls).toHaveLength(0);
  });
});

describe('recordBalanceStatementAction', () => {
  it('refuses a third decimal, an impossible date and an unknown account', async () => {
    for (const input of [
      { accountType: 'provisions', balance: 10.001, statedOn: '2026-09-21' },
      { accountType: 'provisions', balance: 10, statedOn: '2026-02-30' },
      { accountType: 'savings', balance: 10, statedOn: '2026-09-21' },
    ]) {
      const r = await recordBalanceStatementAction(input);
      expect(r).toMatchObject({ ok: false, errorCode: 'errors.validation.generic' });
    }
    expect(h.calls).toHaveLength(0);
  });

  it('writes the statement with session ids and its expected balance, then syncs the column', async () => {
    h.ledger.mockImplementation(async () => ({
      ok: true,
      statements: [stmt(705, '2026-09-01')],
      movements: [],
    }));
    script('account_balance_statements', 'insert', { data: { id: 'new-1' }, error: null });
    script('accounts', 'update', { data: [{ account_type: 'provisions' }], error: null });

    const r = await recordBalanceStatementAction({
      accountType: 'provisions',
      balance: -12.5,
      statedOn: '2026-09-21',
    });

    expect(r).toEqual({ ok: true, data: { id: 'new-1' } });
    const [insert] = writes('account_balance_statements');
    expect(insert!.payload).toEqual({
      workspace_id: 'ws-1',
      created_by: 'user-1',
      account_type: 'provisions',
      balance: -12.5,
      stated_on: '2026-09-21',
      derived_balance: 705,
    });
    const [column] = writes('accounts');
    // The ledger mock still returns the OLD statements: the column takes the
    // latest standing one it reads, which is exactly the contract.
    expect(column!.filters).toEqual({ workspace_id: 'ws-1', account_type: 'provisions' });
    expect(column!.payload).toEqual({ balance: 705 });
    expect(h.audit).toHaveBeenCalledOnce();
  });

  it('cancels its own statement when the column write fails (compensation)', async () => {
    h.ledger.mockImplementation(async () => ({
      ok: true,
      statements: [stmt(705, '2026-09-01')],
      movements: [],
    }));
    script('account_balance_statements', 'insert', { data: { id: 'new-1' }, error: null });
    script('accounts', 'update', { data: null, error: { message: 'boom' } });
    script('account_balance_statements', 'update', { data: [{ id: 'new-1' }], error: null });

    const r = await recordBalanceStatementAction({
      accountType: 'provisions',
      balance: 700,
      statedOn: '2026-09-21',
    });

    expect(r).toEqual({ ok: false, errorCode: 'errors.accounts.balanceUpdateFailed' });
    const compensation = writes('account_balance_statements').find((c) => c.op === 'update');
    expect(compensation!.filters).toEqual({ id: 'new-1', workspace_id: 'ws-1' });
    expect((compensation!.payload as { cancelled_at: string | null }).cancelled_at).not.toBeNull();
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe('setStatementCancelledAction — cancel, then reopen', () => {
  const START = stmt(705, '2026-09-01');
  const READ = { ...stmt(690, '2026-09-15'), id: ID };

  it('cancels, then reopens, and re-syncs the column each time', async () => {
    for (const cancelled of [true, false]) {
      h.ledger.mockImplementation(async () => ({
        ok: true,
        statements: [START, { ...READ, cancelledAt: cancelled ? null : new Date() }],
        movements: [],
      }));
      script('account_balance_statements', 'update', { data: [{ id: ID }], error: null });
      script('accounts', 'update', { data: [{ account_type: 'provisions' }], error: null });
      expect(await setStatementCancelledAction({ id: ID, cancelled })).toEqual({ ok: true });
    }
    const updates = writes('account_balance_statements');
    expect((updates[0]!.payload as { cancelled_at: unknown }).cancelled_at).not.toBeNull();
    expect(updates[1]!.payload).toEqual({ cancelled_at: null });
    expect(updates.every((u) => u.filters.workspace_id === 'ws-1')).toBe(true);
    expect(writes('accounts')).toHaveLength(2);
  });

  it('writes nothing when the row is already in the asked state (no blind compensation)', async () => {
    h.ledger.mockImplementation(async () => ({
      ok: true,
      statements: [START, { ...READ, cancelledAt: new Date() }],
      movements: [],
    }));
    expect(await setStatementCancelledAction({ id: ID, cancelled: true })).toEqual({ ok: true });
    expect(h.calls).toHaveLength(0);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('refuses to cancel the starting balance, even called directly', async () => {
    h.ledger.mockImplementation(async () => ({
      ok: true,
      statements: [{ ...START, id: ID }],
      movements: [],
    }));
    expect(await setStatementCancelledAction({ id: ID, cancelled: true })).toEqual({
      ok: false,
      errorCode: 'errors.operations.startingBalance',
    });
    expect(h.calls).toHaveLength(0);
  });

  it('says notFound for a row outside the workspace (absent from the RLS read)', async () => {
    h.ledger.mockImplementation(async () => ({ ok: true, statements: [START], movements: [] }));
    const r = await setStatementCancelledAction({ id: ID, cancelled: true });
    expect(r).toEqual({ ok: false, errorCode: 'errors.operations.notFound' });
    expect(h.calls).toHaveLength(0);
  });

  it('refuses a non-uuid id', async () => {
    const r = await setStatementCancelledAction({ id: 'abc', cancelled: true });
    expect(r).toMatchObject({ ok: false, errorCode: 'errors.validation.generic' });
  });
});

describe('dates in the future are refused', () => {
  it('refuses a statement dated after today', async () => {
    const r = await recordBalanceStatementAction({
      accountType: 'provisions',
      balance: 10,
      statedOn: '2062-09-21',
    });
    expect(r).toEqual({
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: { statedOn: ['operations.date.future'] },
    });
    expect(h.calls).toHaveLength(0);
  });
});

const smoothed = (amount: number, frequency: Charge['frequency'], dueMonth: number): Charge => ({
  id: `c-${amount}-${frequency}`,
  label: 'Facture fictive',
  amount: money(amount),
  frequency,
  dueMonth,
  paymentMonths: [dueMonth],
  paymentDay: 1,
  categoryId: null,
  isActive: true,
  paidFrom: 'epargne',
});

describe('recordPlannedTransferAction', () => {
  const base = {
    fromAccountType: 'income_bills',
    occurredOn: '2026-09-21',
    planYear: 2026,
    planMonth: 9,
  };

  it('refuses a second standing transfer for the same plan line', async () => {
    script('movements', 'select', { data: [{ id: 'm-0' }], error: null });
    const r = await recordPlannedTransferAction({
      ...base,
      toAccountType: 'daily_card',
      amount: 505,
      planSuggestedAmount: 505,
      plannedProvisions: 0,
    });
    expect(r).toEqual({ ok: false, errorCode: 'errors.operations.alreadyDone' });
    expect(writes('movements')).toHaveLength(0);
  });

  it('accepts a plan month other than the month of its date, and writes both as given', async () => {
    script('movements', 'select', { data: [], error: null });
    script('movements', 'insert', { data: { id: 'm-next' }, error: null });
    const r = await recordPlannedTransferAction({
      ...base,
      planMonth: 10,
      toAccountType: 'daily_card',
      amount: 505,
      planSuggestedAmount: 505,
      plannedProvisions: 0,
    });
    expect(r).toEqual({ ok: true, data: { id: 'm-next' } });
    expect(writes('movements')[0]!.payload).toMatchObject({
      occurred_on: '2026-09-21',
      plan_year: 2026,
      plan_month: 10,
    });
  });

  it('accepts the figures of a real plan, once rounded to the cent (280/12 + 70/3)', async () => {
    h.charges.mockResolvedValueOnce([smoothed(280, 'annual', 1), smoothed(70, 'quarterly', 1)]);
    script('movements', 'select', { data: [], error: null });
    script('movements', 'insert', { data: { id: 'm-3' }, error: null });
    const r = await recordPlannedTransferAction({
      ...base,
      toAccountType: 'provisions',
      amount: 46.67,
      planSuggestedAmount: 46.67,
      plannedProvisions: 46.67,
    });
    expect(r).toEqual({ ok: true, data: { id: 'm-3' } });
    expect(writes('movements')[0]!.payload).toMatchObject({
      provision_part: 46.67,
      free_savings_part: 0,
    });
  });

  it('splits a transfer to provisions: provisions first, the rest is free savings', async () => {
    h.charges.mockResolvedValueOnce([smoothed(708, 'annual', 1)]);
    script('movements', 'select', { data: [], error: null });
    script('movements', 'insert', { data: { id: 'm-1' }, error: null });
    const r = await recordPlannedTransferAction({
      ...base,
      toAccountType: 'provisions',
      amount: 360,
      planSuggestedAmount: 59,
      plannedProvisions: 59,
    });
    expect(r).toEqual({ ok: true, data: { id: 'm-1' } });
    expect(writes('movements')[0]!.payload).toMatchObject({
      workspace_id: 'ws-1',
      created_by: 'user-1',
      kind: 'transfer',
      amount: 360,
      plan_suggested_amount: 59,
      provision_part: 59,
      free_savings_part: 301,
    });
  });

  it('splits with the NET of the month, not the target: a smoothed bill due leaves the main account', async () => {
    // 840 a year (70 a month) + a monthly smoothed 15, due this month: the line
    // proposes 70 + 15 − 15 = 70, so a 505 transfer is 70 + 435 — never 85 + 420.
    h.charges.mockResolvedValueOnce([smoothed(840, 'annual', 1), smoothed(15, 'monthly', 1)]);
    script('movements', 'select', { data: [], error: null });
    script('movements', 'insert', { data: { id: 'm-net' }, error: null });
    const r = await recordPlannedTransferAction({
      ...base,
      toAccountType: 'provisions',
      amount: 505,
      planSuggestedAmount: 70,
      plannedProvisions: 70,
    });
    expect(r).toEqual({ ok: true, data: { id: 'm-net' } });
    expect(writes('movements')[0]!.payload).toMatchObject({
      provision_part: 70,
      free_savings_part: 435,
    });
  });

  it('ignores a provisions share sent by the client: the server computes it', async () => {
    h.charges.mockResolvedValueOnce([smoothed(840, 'annual', 1)]);
    script('movements', 'select', { data: [], error: null });
    script('movements', 'insert', { data: { id: 'm-forged' }, error: null });
    const r = await recordPlannedTransferAction({
      ...base,
      toAccountType: 'provisions',
      amount: 505,
      planSuggestedAmount: 70,
      plannedProvisions: 505,
    });
    expect(r).toEqual({ ok: true, data: { id: 'm-forged' } });
    expect(writes('movements')[0]!.payload).toMatchObject({
      provision_part: 70,
      free_savings_part: 435,
    });
  });

  it('writes nothing when the charges cannot be read', async () => {
    h.charges.mockResolvedValueOnce(null);
    script('movements', 'select', { data: [], error: null });
    const r = await recordPlannedTransferAction({
      ...base,
      toAccountType: 'provisions',
      amount: 505,
      planSuggestedAmount: 70,
      plannedProvisions: 70,
    });
    expect(r).toEqual({ ok: false, errorCode: 'errors.operations.writeFailed' });
    expect(writes('movements')).toHaveLength(0);
  });

  it('writes no split elsewhere, and never touches accounts.balance', async () => {
    script('movements', 'select', { data: [], error: null });
    script('movements', 'insert', { data: { id: 'm-2' }, error: null });
    await recordPlannedTransferAction({
      ...base,
      toAccountType: 'daily_card',
      amount: 505,
      planSuggestedAmount: 505,
      plannedProvisions: 59,
    });
    expect(writes('movements')[0]!.payload).toMatchObject({
      provision_part: null,
      free_savings_part: null,
    });
    expect(h.calls.some((c) => c.table === 'accounts')).toBe(false);
  });

  it('refuses a transfer from an account to itself and a zero amount', async () => {
    for (const patch of [
      { toAccountType: 'income_bills', amount: 10 },
      { toAccountType: 'daily_card', amount: 0 },
    ]) {
      const r = await recordPlannedTransferAction({
        ...base,
        ...patch,
        planSuggestedAmount: 10,
        plannedProvisions: 0,
      });
      expect(r.ok).toBe(false);
    }
    expect(h.calls).toHaveLength(0);
  });
});

describe('recordIncomeAction', () => {
  it('writes the default description of the nature when none is typed', async () => {
    script('movements', 'insert', { data: { id: 'i-1' }, error: null });
    await recordIncomeAction({
      toAccountType: 'income_bills',
      amount: 2000,
      occurredOn: '2026-09-01',
      nature: 'regular',
      description: '   ',
    });
    expect(writes('movements')[0]!.payload).toMatchObject({
      kind: 'income',
      income_nature: 'regular',
      description: 'Revenu du mois',
      workspace_id: 'ws-1',
    });
    expect(h.calls.some((c) => c.table === 'accounts')).toBe(false);
  });

  it('keeps the typed description as written', async () => {
    script('movements', 'insert', { data: { id: 'i-2' }, error: null });
    await recordIncomeAction({
      toAccountType: 'income_bills',
      amount: 40,
      occurredOn: '2026-09-02',
      nature: 'extra',
      description: 'Remboursement mutuelle',
    });
    expect(writes('movements')[0]!.payload).toMatchObject({
      description: 'Remboursement mutuelle',
    });
  });

  // Tour 42 (ADR-046) — the month this money counts for.
  it('writes the assigned month when it differs from the month of the date', async () => {
    script('movements', 'insert', { data: { id: 'i-3' }, error: null });
    await recordIncomeAction({
      toAccountType: 'income_bills',
      amount: 705,
      occurredOn: '2026-09-02',
      nature: 'regular',
      description: 'Salaire',
      budgetMonth: '2026-10',
    });
    expect(writes('movements')[0]!.payload).toStrictEqual({
      workspace_id: 'ws-1',
      created_by: expect.any(String),
      kind: 'income',
      to_account_type: 'income_bills',
      amount: 705,
      occurred_on: '2026-09-02',
      income_nature: 'regular',
      description: 'Salaire',
      budget_year: 2026,
      budget_month: 10,
    });
  });

  it('writes no assignment when the chosen month is the month of the date', async () => {
    script('movements', 'insert', { data: { id: 'i-4' }, error: null });
    await recordIncomeAction({
      toAccountType: 'income_bills',
      amount: 505,
      occurredOn: '2026-09-02',
      nature: 'regular',
      budgetMonth: '2026-09',
    });
    const payload = writes('movements')[0]!.payload as Record<string, unknown>;
    expect('budget_year' in payload).toBe(false);
    expect('budget_month' in payload).toBe(false);
  });

  it('refuses a month more than one month away from the date, and writes nothing', async () => {
    const r = await recordIncomeAction({
      toAccountType: 'income_bills',
      amount: 505,
      occurredOn: '2026-09-02',
      nature: 'regular',
      budgetMonth: '2026-12',
    });
    expect(r.ok).toBe(false);
    // The refusal must come from THIS rule, not from any other field.
    expect(!r.ok && r.fieldErrors?.budgetMonth).toEqual(['operations.budgetMonth.outOfRange']);
    expect(writes('movements')).toHaveLength(0);
  });
});

describe('setMovementCancelledAction', () => {
  const row = (cancelled: boolean) => ({
    id: ID,
    kind: 'transfer',
    from_account_type: 'income_bills',
    to_account_type: 'daily_card',
    plan_year: 2026,
    plan_month: 9,
    cancelled_at: cancelled ? '2026-09-20T10:00:00Z' : null,
  });

  it('cancels then reopens through cancelled_at only, scoped to the workspace', async () => {
    script('movements', 'select', { data: row(false), error: null });
    script('movements', 'update', { data: [{ id: ID }], error: null });
    expect(await setMovementCancelledAction({ id: ID, cancelled: true })).toEqual({ ok: true });
    script('movements', 'select', { data: row(true), error: null });
    script('movements', 'select', { data: [], error: null });
    script('movements', 'update', { data: [{ id: ID }], error: null });
    expect(await setMovementCancelledAction({ id: ID, cancelled: false })).toEqual({ ok: true });
    const [cancel, reopen] = writes('movements');
    expect(Object.keys(cancel!.payload as object)).toEqual(['cancelled_at']);
    expect(reopen!.payload).toEqual({ cancelled_at: null });
    expect(cancel!.filters).toEqual({ id: ID, workspace_id: 'ws-1' });
  });

  it('refuses to reopen when the line was done again meanwhile', async () => {
    script('movements', 'select', { data: row(true), error: null });
    script('movements', 'select', { data: [{ id: 'other' }], error: null });
    expect(await setMovementCancelledAction({ id: ID, cancelled: false })).toEqual({
      ok: false,
      errorCode: 'errors.operations.alreadyDone',
    });
    expect(writes('movements')).toHaveLength(0);
  });

  it('writes nothing when already in the asked state, and says notFound outside the workspace', async () => {
    script('movements', 'select', { data: row(true), error: null });
    expect(await setMovementCancelledAction({ id: ID, cancelled: true })).toEqual({ ok: true });
    script('movements', 'select', { data: null, error: null });
    expect(await setMovementCancelledAction({ id: ID, cancelled: true })).toEqual({
      ok: false,
      errorCode: 'errors.operations.notFound',
    });
    expect(writes('movements')).toHaveLength(0);
  });

  it('returns writeFailed on a database error instead of throwing', async () => {
    script('movements', 'select', { data: null, error: { message: 'x' } });
    expect(await setMovementCancelledAction({ id: ID, cancelled: true })).toEqual({
      ok: false,
      errorCode: 'errors.operations.writeFailed',
    });
  });
});

/*
 * Every money gesture is audited (decision @thierry, 2026-09-21) — and the
 * event carries WHAT happened to WHICH row, never the amount nor the
 * description: the audit log leaves in the art. 20 export, it must not
 * double the data.
 */
describe('audit — every money gesture writes one event, without its data', () => {
  const lastAudit = () => h.audit.mock.calls.at(-1) as unknown as [string, unknown, object];

  it('audits a planned transfer done', async () => {
    script('movements', 'select', { data: [], error: null });
    script('movements', 'insert', { data: { id: 'mv-1' }, error: null });
    const r = await recordPlannedTransferAction({
      fromAccountType: 'income_bills',
      toAccountType: 'daily_card',
      amount: 505,
      occurredOn: '2026-09-21',
      planYear: 2026,
      planMonth: 9,
      planSuggestedAmount: 505,
      plannedProvisions: 0,
    });
    expect(r.ok).toBe(true);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(lastAudit()).toEqual([
      'movement.recorded',
      { userId: 'user-1', workspaceId: 'ws-1' },
      { resource_type: 'movement_transfer', resource_id: 'mv-1' },
    ]);
  });

  it('audits money received, without the typed description nor the amount', async () => {
    script('movements', 'insert', { data: { id: 'mv-2' }, error: null });
    const r = await recordIncomeAction({
      toAccountType: 'income_bills',
      amount: 705,
      occurredOn: '2026-09-21',
      nature: 'extra',
      description: 'Remboursement mutuelle',
    });
    expect(r.ok).toBe(true);
    expect(lastAudit()).toEqual([
      'movement.recorded',
      { userId: 'user-1', workspaceId: 'ws-1' },
      { resource_type: 'movement_income', resource_id: 'mv-2' },
    ]);
    expect(JSON.stringify(h.audit.mock.calls)).not.toMatch(/Remboursement|705/);
  });

  it('audits a cancellation then a reopening, with both states', async () => {
    const row = (cancelled: boolean) => ({
      id: ID,
      kind: 'income',
      from_account_type: null,
      to_account_type: 'income_bills',
      plan_year: null,
      plan_month: null,
      cancelled_at: cancelled ? '2026-09-20T10:00:00Z' : null,
    });
    script('movements', 'select', { data: row(false), error: null });
    script('movements', 'update', { data: [{ id: ID }], error: null });
    await setMovementCancelledAction({ id: ID, cancelled: true });
    expect(lastAudit()).toEqual([
      'movement.cancellation_set',
      { userId: 'user-1', workspaceId: 'ws-1' },
      {
        resource_type: 'movement_income',
        resource_id: ID,
        previous_state: 'standing',
        new_state: 'cancelled',
      },
    ]);
    script('movements', 'select', { data: row(true), error: null });
    script('movements', 'update', { data: [{ id: ID }], error: null });
    await setMovementCancelledAction({ id: ID, cancelled: false });
    expect(lastAudit()[2]).toMatchObject({ previous_state: 'cancelled', new_state: 'standing' });
    expect(h.audit).toHaveBeenCalledTimes(2);
  });

  it('audits nothing when the write fails', async () => {
    script('movements', 'insert', { data: null, error: { message: 'x' } });
    await recordIncomeAction({
      toAccountType: 'income_bills',
      amount: 705,
      occurredOn: '2026-09-21',
      nature: 'regular',
    });
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('carries the statement cancel state in whitelisted keys, as fixed strings', async () => {
    h.ledger.mockImplementation(async () => ({
      ok: true,
      statements: [stmt(705, '2026-09-01'), { ...stmt(690, '2026-09-15'), id: ID }],
      movements: [],
    }));
    script('account_balance_statements', 'update', { data: [{ id: ID }], error: null });
    script('accounts', 'update', { data: [{ account_type: 'provisions' }], error: null });
    await setStatementCancelledAction({ id: ID, cancelled: true });
    expect(lastAudit()[2]).toEqual({
      resource_type: 'account_balance_statement',
      resource_id: ID,
      previous_state: 'standing',
      new_state: 'cancelled',
    });
  });
});

describe('compensation that fails itself', () => {
  it('logs the statement id (no figure) and still returns an error, on a new statement', async () => {
    h.ledger.mockImplementation(async () => ({
      ok: true,
      statements: [stmt(705, '2026-09-01')],
      movements: [],
    }));
    script('account_balance_statements', 'insert', { data: { id: 'new-1' }, error: null });
    script('accounts', 'update', { data: null, error: { message: 'boom' } });
    script('account_balance_statements', 'update', { data: null, error: { message: 'down' } });

    const r = await recordBalanceStatementAction({
      accountType: 'provisions',
      balance: 700,
      statedOn: '2026-09-21',
    });
    expect(r).toEqual({ ok: false, errorCode: 'errors.accounts.balanceUpdateFailed' });
    expect(h.logError).toHaveBeenCalledTimes(1);
    expect((h.logError.mock.calls[0] as unknown[])[1]).toEqual({
      statement_id: 'new-1',
      gesture: 'record',
      error_code: 'no_code',
    });
    expect(h.audit).toHaveBeenCalledWith(
      'account.balance_updated',
      { userId: 'user-1', workspaceId: 'ws-1' },
      {
        resource_type: 'account_balance_statement',
        resource_id: 'new-1',
        error_code: 'compensation_failed',
      },
    );
    expect(JSON.stringify(h.logError.mock.calls)).not.toMatch(/700|705/);
  });

  it('logs on a failed cancel compensation, and not when the compensation works', async () => {
    h.ledger.mockImplementation(async () => ({
      ok: true,
      statements: [stmt(705, '2026-09-01'), { ...stmt(690, '2026-09-15'), id: ID }],
      movements: [],
    }));
    script('account_balance_statements', 'update', { data: [{ id: ID }], error: null });
    script('accounts', 'update', { data: null, error: { message: 'boom' } });
    script('account_balance_statements', 'update', { data: [{ id: ID }], error: null });
    expect(await setStatementCancelledAction({ id: ID, cancelled: true })).toEqual({
      ok: false,
      errorCode: 'errors.accounts.balanceUpdateFailed',
    });
    expect(h.logError).not.toHaveBeenCalled();

    script('account_balance_statements', 'update', { data: [{ id: ID }], error: null });
    script('accounts', 'update', { data: null, error: { message: 'boom' } });
    script('account_balance_statements', 'update', { data: null, error: { message: 'down' } });
    await setStatementCancelledAction({ id: ID, cancelled: true });
    expect(h.logError).toHaveBeenCalledTimes(1);
    expect((h.logError.mock.calls[0] as unknown[])[1]).toEqual({
      statement_id: ID,
      gesture: 'cancel',
      error_code: 'no_code',
    });
  });

  it('logs when the compensation is refused silently (zero rows, no error: RLS)', async () => {
    h.ledger.mockImplementation(async () => ({
      ok: true,
      statements: [stmt(705, '2026-09-01')],
      movements: [],
    }));
    script('account_balance_statements', 'insert', { data: { id: 'new-2' }, error: null });
    script('accounts', 'update', { data: null, error: { message: 'boom' } });
    script('account_balance_statements', 'update', { data: [], error: null });
    await recordBalanceStatementAction({
      accountType: 'provisions',
      balance: 700,
      statedOn: '2026-09-21',
    });
    expect((h.logError.mock.calls[0] as unknown[])[1]).toEqual({
      statement_id: 'new-2',
      gesture: 'record',
      error_code: 'no_row',
    });
  });
});

// =========================================================================
// ADR-045 D21 — an operation dated on the day of the account's statement
// =========================================================================
const D21_SID = '4b0f6c1e-2d3a-4e5f-8a9b-0c1d2e3f4a5b';
const d17Day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const d17Statement = (
  id: string,
  balance: number,
  statedOn: string,
  recordedAt: string,
  cancelled = false,
) => ({
  id,
  accountType: 'income_bills' as const,
  balance: money(balance),
  statedOn: d17Day(statedOn),
  recordedAt: new Date(recordedAt),
  cancelledAt: cancelled ? new Date('2026-09-21T10:00:00Z') : null,
});
const d17Previous = d17Statement('s-prev', 200, '2026-09-10', '2026-09-10T08:00:00Z');
const d17OfTheDay = d17Statement(D21_SID, 905, '2026-09-21', '2026-09-21T08:00:00Z');
const d17Income = {
  id: 'm-new',
  kind: 'income' as const,
  fromAccountType: null,
  toAccountType: 'income_bills' as const,
  amount: money(705),
  occurredOn: d17Day('2026-09-21'),
  recordedAt: new Date('2026-09-21T09:00:00Z'),
  cancelledAt: null,
  planYear: null,
  planMonth: null,
  planSuggestedAmount: null,
  provisionPart: null,
  freeSavingsPart: null,
  incomeNature: 'regular' as const,
  budgetYear: null,
  budgetMonth: null,
  description: null,
};
const d17Ledger = (movements: unknown[] = []) => ({
  ok: true,
  statements: [d17Previous, d17OfTheDay],
  movements,
});
const nonSelect = () => h.calls.filter((c) => c.op !== 'select');

// ADR-045 D23 — ids shaped like the base's: the CHECK on
// `statement_included_flows.flow_id` wants a uuid-like movement id.
const M_NEW = '5d2a7f10-3c4b-4d5e-9f60-718293a4b5c6';
const M_AFTER = '6e3b8a21-4d5c-4e6f-8a71-8293a4b5c6d7';
const EXPENSE_ID = 'expense:8a5dac43-6f7e-4a81-8c93-a4b5c6d7e8f9';
/** Money received on `income_bills`, the statement's day, written after it (09:00). */
const d23Income = (id: string, patch: Record<string, unknown> = {}) => ({
  ...d17Income,
  id,
  ...patch,
});
/** A transfer of that day leaving `income_bills` for `daily_card`. */
const d23Transfer = (id: string, patch: Record<string, unknown> = {}) => ({
  ...d17Income,
  id,
  kind: 'transfer' as const,
  fromAccountType: 'income_bills' as const,
  toAccountType: 'daily_card' as const,
  amount: money(505),
  incomeNature: null,
  ...patch,
});
const inclusions = () => h.calls.filter((c) => c.table === 'statement_included_flows');
const trail = () => h.calls.map((c) => `${c.table}.${c.op}`);
const statementEvents = () =>
  h.audit.mock.calls
    .map((c) => c as unknown[])
    .filter((c) => c[0] === 'account.balance_updated')
    .map((c) => c[2]);

describe('same-day statement — the question, then one answer per operation (D23)', () => {
  const income = (extra: Record<string, unknown> = {}) => ({
    toAccountType: 'income_bills',
    amount: 705,
    occurredOn: '2026-09-21',
    nature: 'regular',
    ...extra,
  });

  it('refuses, and writes nothing, when the question applies and has no answer', async () => {
    h.ledger.mockImplementation(async () => d17Ledger());
    const r = await recordIncomeAction(income());
    expect(r).toMatchObject({
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: { statementAnswers: ['operations.sameDay.required'] },
    });
    expect(nonSelect()).toHaveLength(0);
  });

  it('refuses an answer that is not one of the two', async () => {
    h.ledger.mockImplementation(async () => d17Ledger());
    const r = await recordIncomeAction(income({ statementAnswers: { income_bills: 'maybe' } }));
    expect(r.ok).toBe(false);
    expect(nonSelect()).toHaveLength(0);
  });

  it('« Non, pas encore » writes the income and nothing else', async () => {
    h.ledger.mockImplementation(async () => d17Ledger());
    script('movements', 'insert', { data: { id: M_NEW }, error: null });
    const r = await recordIncomeAction(income({ statementAnswers: { income_bills: 'notYet' } }));
    expect(r.ok).toBe(true);
    expect(trail()).toEqual(['movements.insert']);
  });

  it('« Oui » writes the income, then ONE answer for THIS operation — no statement written or rewritten', async () => {
    h.ledger
      .mockImplementationOnce(async () => d17Ledger())
      .mockImplementationOnce(async () => d17Ledger([d23Income(M_NEW)]));
    script('movements', 'insert', { data: { id: M_NEW }, error: null });
    script('statement_included_flows', 'insert', { data: [{ id: 'inc-1' }], error: null });

    const r = await recordIncomeAction(income({ statementAnswers: { income_bills: 'included' } }));

    expect(r).toEqual({ ok: true, data: { id: M_NEW } });
    expect(trail()).toEqual(['movements.insert', 'statement_included_flows.insert']);
    // The ids come from the session; the flow is the income's own half.
    expect(inclusions()[0]!.payload).toStrictEqual({
      workspace_id: 'ws-1',
      created_by: 'user-1',
      statement_id: D21_SID,
      flow_id: `${M_NEW}:in`,
    });
    expect(writes('account_balance_statements')).toHaveLength(0);
    expect(h.calls.some((c) => c.table === 'accounts')).toBe(false);
    // Audited once the gesture stands: which row, never an amount.
    expect(statementEvents()).toEqual([
      { resource_type: 'statement_included_flow', resource_id: 'inc-1' },
    ]);
    expect(JSON.stringify(h.audit.mock.calls)).not.toMatch(/705|905/);
  });

  // Expected result CHANGED (ADR-045 D23). Under D21 this was REFUSED with
  // `operations.sameDay.othersAfter`: rewriting the statement after the new
  // operation would have silently stopped counting the other one. An answer
  // now touches its own operation only, so the other one keeps counting and
  // nothing forbids the answer any more.
  it('« Oui » is accepted when another operation of the day already counts after the statement, and leaves that one counted', async () => {
    const other = d23Transfer(M_AFTER, { recordedAt: new Date('2026-09-21T08:30:00Z') });
    h.ledger
      .mockImplementationOnce(async () => d17Ledger([other]))
      .mockImplementationOnce(async () => d17Ledger([other, d23Income(M_NEW)]));
    script('movements', 'insert', { data: { id: M_NEW }, error: null });
    script('statement_included_flows', 'insert', { data: [{ id: 'inc-1' }], error: null });

    const r = await recordIncomeAction(income({ statementAnswers: { income_bills: 'included' } }));

    expect(r.ok).toBe(true);
    expect(inclusions().map((c) => (c.payload as { flow_id: string }).flow_id)).toEqual([
      `${M_NEW}:in`,
    ]);
    expect(writes('account_balance_statements')).toHaveLength(0);
  });

  it('« Non » stays possible on such a day', async () => {
    h.ledger.mockImplementation(async () =>
      d17Ledger([d23Transfer(M_AFTER, { recordedAt: new Date('2026-09-21T08:30:00Z') })]),
    );
    script('movements', 'insert', { data: { id: M_NEW }, error: null });
    const r = await recordIncomeAction(income({ statementAnswers: { income_bills: 'notYet' } }));
    expect(r.ok).toBe(true);
    expect(inclusions()).toHaveLength(0);
  });

  it('ignores an answer for an account whose statement is not of that day', async () => {
    h.ledger.mockImplementation(async () => ({
      ok: true,
      statements: [d17Previous],
      movements: [],
    }));
    script('movements', 'insert', { data: { id: M_NEW }, error: null });
    const r = await recordIncomeAction(income({ statementAnswers: { income_bills: 'included' } }));
    expect(r.ok).toBe(true);
    expect(inclusions()).toHaveLength(0);
    expect(writes('account_balance_statements')).toHaveLength(0);
  });

  it('does not ask on the day of the starting balance, and writes no answer there', async () => {
    h.ledger.mockImplementation(async () => ({
      ok: true,
      statements: [d17OfTheDay],
      movements: [],
    }));
    script('movements', 'insert', { data: { id: M_NEW }, error: null });
    expect((await recordIncomeAction(income())).ok).toBe(true);
    script('movements', 'insert', { data: { id: M_NEW }, error: null });
    const r = await recordIncomeAction(income({ statementAnswers: { income_bills: 'included' } }));
    expect(r.ok).toBe(true);
    expect(inclusions()).toHaveLength(0);
    expect(writes('account_balance_statements')).toHaveLength(0);
  });

  it.each<[string, Result]>([
    ['an error', { data: null, error: { message: 'x' } }],
    ['zero row and no error (RLS)', { data: [], error: null }],
  ])(
    'cancels the income it just wrote when the answer is refused (%s), and says so',
    async (_label, refused) => {
      h.ledger
        .mockImplementationOnce(async () => d17Ledger())
        .mockImplementationOnce(async () => d17Ledger([d23Income(M_NEW)]));
      script('movements', 'insert', { data: { id: M_NEW }, error: null });
      script('statement_included_flows', 'insert', refused);
      script('movements', 'update', { data: [{ id: M_NEW }], error: null });

      const r = await recordIncomeAction(
        income({ statementAnswers: { income_bills: 'included' } }),
      );

      expect(r).toEqual({ ok: false, errorCode: 'errors.operations.writeFailed' });
      const undo = writes('movements')[1]!;
      expect(undo).toMatchObject({ op: 'update', filters: { id: M_NEW, workspace_id: 'ws-1' } });
      expect((undo.payload as { cancelled_at: string | null }).cancelled_at).not.toBeNull();
      expect(writes('account_balance_statements')).toHaveLength(0);
      expect(h.audit).not.toHaveBeenCalled();
    },
  );

  it('writes no answer, and cancels the income, when the statement changed between the question and the write', async () => {
    // A second tab read a newer balance of that day meanwhile.
    const newer = d17Statement('s-newer', 1000, '2026-09-21', '2026-09-21T08:45:00Z');
    h.ledger
      .mockImplementationOnce(async () => d17Ledger())
      .mockImplementationOnce(async () => ({
        ok: true,
        statements: [d17Previous, d17OfTheDay, newer],
        movements: [d23Income(M_NEW)],
      }));
    script('movements', 'insert', { data: { id: M_NEW }, error: null });
    script('movements', 'update', { data: [{ id: M_NEW }], error: null });

    const r = await recordIncomeAction(income({ statementAnswers: { income_bills: 'included' } }));

    expect(r).toEqual({ ok: false, errorCode: 'errors.operations.writeFailed' });
    expect(inclusions()).toHaveLength(0);
    expect(writes('movements')[1]).toMatchObject({ op: 'update', filters: { id: M_NEW } });
  });

  describe('a transfer between two accounts read that day', () => {
    const daily = { ...d17OfTheDay, id: 'daily-of-the-day', accountType: 'daily_card' as const };
    const dailyPrev = { ...d17Previous, id: 'daily-prev', accountType: 'daily_card' as const };
    const statements = [d17Previous, d17OfTheDay, dailyPrev, daily];
    const transfer = {
      fromAccountType: 'income_bills',
      toAccountType: 'daily_card',
      amount: 505,
      occurredOn: '2026-09-21',
      planYear: 2026,
      planMonth: 10,
      planSuggestedAmount: 505,
      statementAnswers: { income_bills: 'included', daily_card: 'included' },
    };
    const scriptLedger = () =>
      h.ledger
        .mockImplementationOnce(async () => ({ ok: true, statements, movements: [] }))
        .mockImplementationOnce(async () => ({
          ok: true,
          statements,
          movements: [d23Transfer(M_NEW)],
        }));

    it('writes one answer per account, each for its own half of the transfer', async () => {
      scriptLedger();
      script('movements', 'select', { data: [], error: null });
      script('movements', 'insert', { data: { id: M_NEW }, error: null });
      script('statement_included_flows', 'insert', { data: [{ id: 'inc-1' }], error: null });
      script('statement_included_flows', 'insert', { data: [{ id: 'inc-2' }], error: null });

      const r = await recordPlannedTransferAction(transfer);

      expect(r).toEqual({ ok: true, data: { id: M_NEW } });
      expect(
        inclusions().map((c) => {
          const p = c.payload as { statement_id: string; flow_id: string };
          return [p.statement_id, p.flow_id];
        }),
      ).toEqual([
        [D21_SID, `${M_NEW}:out`],
        ['daily-of-the-day', `${M_NEW}:in`],
      ]);
      expect(statementEvents()).toEqual([
        { resource_type: 'statement_included_flow', resource_id: 'inc-1' },
        { resource_type: 'statement_included_flow', resource_id: 'inc-2' },
      ]);
    });

    it('on the second answer refused, withdraws the first one, THEN cancels the transfer', async () => {
      scriptLedger();
      script('movements', 'select', { data: [], error: null });
      script('movements', 'insert', { data: { id: M_NEW }, error: null });
      script('statement_included_flows', 'insert', { data: [{ id: 'inc-1' }], error: null });
      script('statement_included_flows', 'insert', { data: null, error: { message: 'x' } });
      script('statement_included_flows', 'delete', { data: [{ id: 'inc-1' }], error: null });
      script('movements', 'update', { data: [{ id: M_NEW }], error: null });

      const r = await recordPlannedTransferAction(transfer);

      expect(r).toEqual({ ok: false, errorCode: 'errors.operations.writeFailed' });
      expect(trail()).toEqual([
        'movements.select',
        'movements.insert',
        'statement_included_flows.insert',
        'statement_included_flows.insert',
        'statement_included_flows.delete',
        'movements.update',
      ]);
      const withdrawn = inclusions().find((c) => c.op === 'delete')!;
      expect(withdrawn.filters).toEqual({ id: 'inc-1', workspace_id: 'ws-1' });
      expect(writes('movements').at(-1)).toMatchObject({ op: 'update', filters: { id: M_NEW } });
      // Nothing stood: no answer was audited.
      expect(statementEvents()).toEqual([]);
    });
  });

  it('asks for the account a transfer LEAVES too', async () => {
    h.ledger.mockImplementation(async () => d17Ledger());
    const r = await recordPlannedTransferAction({
      fromAccountType: 'income_bills',
      toAccountType: 'daily_card',
      amount: 505,
      occurredOn: '2026-09-21',
      planYear: 2026,
      planMonth: 10,
      planSuggestedAmount: 505,
      plannedProvisions: 0,
    });
    expect(r).toMatchObject({
      ok: false,
      fieldErrors: { statementAnswers: ['operations.sameDay.required'] },
    });
    expect(nonSelect()).toHaveLength(0);
  });
});

describe('setFlowIncludedAction — the card of the account, one operation at a time (D23)', () => {
  const answer = (flowId: string, included: unknown = true) => ({
    statementId: D21_SID,
    flowId,
    included,
  });
  const notFound = { ok: false, errorCode: 'errors.operations.notFound' };
  const writeFailed = { ok: false, errorCode: 'errors.operations.writeFailed' };
  /** The statement of the day, once « already inside » was answered for M_AFTER. */
  const answered = { ...d17OfTheDay, includedFlowIds: [`${M_AFTER}:in`] };
  const answeredLedger = () => ({
    ok: true,
    statements: [d17Previous, answered],
    movements: [d23Income(M_AFTER)],
  });

  it('writes one answer for an operation of the day written after the statement, in the session workspace', async () => {
    h.ledger.mockImplementation(async () => d17Ledger([d23Income(M_AFTER)]));
    script('statement_included_flows', 'insert', { data: [{ id: 'inc-1' }], error: null });

    const r = await setFlowIncludedAction(answer(`${M_AFTER}:in`));

    expect(r).toEqual({ ok: true });
    expect(trail()).toEqual(['statement_included_flows.insert']);
    expect(inclusions()[0]!.payload).toStrictEqual({
      workspace_id: 'ws-1',
      created_by: 'user-1',
      statement_id: D21_SID,
      flow_id: `${M_AFTER}:in`,
    });
    expect(h.ledger).toHaveBeenCalledWith(h.client, 'ws-1');
    expect(statementEvents()).toEqual([
      { resource_type: 'statement_included_flow', resource_id: 'inc-1' },
    ]);
    expect(JSON.stringify(h.audit.mock.calls)).not.toMatch(/705/);
  });

  it('accepts an expense of that day too (ADR-045 D22 flow ids)', async () => {
    const expense = {
      id: EXPENSE_ID,
      accountType: 'income_bills' as const,
      direction: 'out' as const,
      amount: money(2.99),
      occurredOn: d17Day('2026-09-21'),
      recordedAt: new Date('2026-09-21T09:30:00Z'),
      cancelledAt: null,
      origin: 'expense' as const,
    };
    h.ledger.mockImplementation(
      async () => ({ ...d17Ledger(), debits: [expense] }) as ReturnType<typeof d17Ledger>,
    );
    script('statement_included_flows', 'insert', { data: [{ id: 'inc-5' }], error: null });

    expect(await setFlowIncludedAction(answer(EXPENSE_ID))).toEqual({ ok: true });
    expect((inclusions()[0]!.payload as { flow_id: string }).flow_id).toBe(EXPENSE_ID);
  });

  it('refuses, writing nothing, an operation of another account, of another day, written BEFORE the statement, cancelled, or absent from the session workspace', async () => {
    const flowId = `${M_AFTER}:in`;
    for (const movements of [
      // Another account: money received on the daily card.
      [d23Income(M_AFTER, { toAccountType: 'daily_card' })],
      // The arriving half of a transfer: it lands on another account.
      [d23Transfer(M_AFTER)],
      // Another day, though written after the statement.
      [d23Income(M_AFTER, { occurredOn: d17Day('2026-09-20') })],
      // The statement's day, written BEFORE it: the hour rule already has it inside.
      [d23Income(M_AFTER, { recordedAt: new Date('2026-09-21T07:00:00Z') })],
      // Cancelled: it counts nowhere.
      [d23Income(M_AFTER, { cancelledAt: new Date('2026-09-21T10:00:00Z') })],
      // Absent from the ledger read for the SESSION workspace.
      [],
    ]) {
      h.ledger.mockImplementation(async () => d17Ledger(movements));
      expect(await setFlowIncludedAction(answer(flowId))).toEqual(notFound);
    }
    expect(h.calls).toHaveLength(0);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('refuses the starting balance, a stale statement, a cancelled one, and one absent from the workspace', async () => {
    const newer = d17Statement('s-newer', 1000, '2026-09-21', '2026-09-21T08:45:00Z');
    const cancelled = d17Statement(D21_SID, 905, '2026-09-21', '2026-09-21T08:00:00Z', true);
    for (const statements of [
      [d17OfTheDay], // the starting balance: never answered for
      [d17Previous, d17OfTheDay, newer], // another balance was read since
      [d17Previous, cancelled],
      [d17Previous], // not in the session workspace
    ]) {
      h.ledger.mockImplementation(async () => ({
        ok: true,
        statements,
        movements: [d23Income(M_AFTER)],
      }));
      expect(await setFlowIncludedAction(answer(`${M_AFTER}:in`))).toEqual(notFound);
    }
    expect(h.calls).toHaveLength(0);
  });

  it('withdraws an answer (included: false): one delete, scoped to the workspace, the statement and the operation', async () => {
    h.ledger.mockImplementation(async () => answeredLedger());
    script('statement_included_flows', 'delete', { data: [{ id: 'inc-1' }], error: null });

    const r = await setFlowIncludedAction(answer(`${M_AFTER}:in`, false));

    expect(r).toEqual({ ok: true });
    expect(trail()).toEqual(['statement_included_flows.delete']);
    expect(inclusions()[0]!.filters).toEqual({
      workspace_id: 'ws-1',
      statement_id: D21_SID,
      flow_id: `${M_AFTER}:in`,
    });
    expect(statementEvents()).toEqual([
      { resource_type: 'statement_included_flow', resource_id: 'inc-1' },
    ]);
  });

  it('refuses to withdraw an answer never given, and to give the same answer twice', async () => {
    h.ledger.mockImplementation(async () => d17Ledger([d23Income(M_AFTER)]));
    expect(await setFlowIncludedAction(answer(`${M_AFTER}:in`, false))).toEqual(notFound);
    h.ledger.mockImplementation(async () => answeredLedger());
    expect(await setFlowIncludedAction(answer(`${M_AFTER}:in`, true))).toEqual(notFound);
    expect(h.calls).toHaveLength(0);
  });

  it('says writeFailed when the ledger cannot be read, or the write is refused or touches no row — and audits nothing', async () => {
    h.ledger.mockImplementation(async () => ({ ok: false, statements: [], movements: [] }));
    expect(await setFlowIncludedAction(answer(`${M_AFTER}:in`))).toEqual(writeFailed);

    h.ledger.mockImplementation(async () => d17Ledger([d23Income(M_AFTER)]));
    for (const refused of [
      { data: null, error: { message: 'x' } },
      { data: [], error: null },
    ]) {
      script('statement_included_flows', 'insert', refused);
      expect(await setFlowIncludedAction(answer(`${M_AFTER}:in`))).toEqual(writeFailed);
    }

    h.ledger.mockImplementation(async () => answeredLedger());
    for (const refused of [
      { data: null, error: { message: 'x' } },
      { data: [], error: null },
    ]) {
      script('statement_included_flows', 'delete', refused);
      expect(await setFlowIncludedAction(answer(`${M_AFTER}:in`, false))).toEqual(writeFailed);
    }
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('refuses anything but a statement uuid, a flow id of the base’s form and a boolean — before any read', async () => {
    h.ledger.mockClear();
    for (const input of [
      { ...answer(`${M_AFTER}:in`), workspaceId: 'ws-2' },
      { ...answer(`${M_AFTER}:in`), amount: 5 },
      answer('m-after:in'),
      answer(`${M_AFTER}:sideways`),
      answer(`${M_AFTER.toUpperCase()}:in`),
      answer(`income:${M_AFTER}`),
      answer(`${M_AFTER}:in;x`),
      answer(`${M_AFTER}:in`, 'yes'),
      { statementId: 'x', flowId: `${M_AFTER}:in`, included: true },
      { statementId: D21_SID, flowId: `${M_AFTER}:in` },
      {},
    ]) {
      expect(await setFlowIncludedAction(input)).toMatchObject({
        ok: false,
        errorCode: 'errors.validation.generic',
      });
    }
    expect(h.ledger).not.toHaveBeenCalled();
    expect(h.calls).toHaveLength(0);
  });

  it('refuses without a session, before any read', async () => {
    h.auth.mockImplementation(async () => ({ ok: false, errorCode: 'errors.session.expired' }));
    expect(await setFlowIncludedAction(answer(`${M_AFTER}:in`))).toEqual({
      ok: false,
      errorCode: 'errors.session.expired',
    });
    expect(h.calls).toHaveLength(0);
  });
});

// =========================================================================
// The plan month a transfer is written for — the SAME rule as the screen
// (`transferPlanAllowed`), against the budget month running (ADR-047)
// =========================================================================
describe('recordPlannedTransferAction — plan month allowed (current budget month or the next)', () => {
  const transfer = (planYear: number, planMonth: number) => ({
    fromAccountType: 'income_bills',
    toAccountType: 'daily_card',
    amount: 505,
    occurredOn: '2026-09-21',
    planYear,
    planMonth,
    planSuggestedAmount: 505,
  });

  it('refuses a plan month two months ahead, or a past one, and writes nothing', async () => {
    for (const [year, month] of [
      [2026, 11],
      [2026, 8],
      [2027, 9],
    ] as const) {
      const r = await recordPlannedTransferAction(transfer(year, month));
      expect(r).toEqual({ ok: false, errorCode: 'errors.operations.planMonthNotAllowed' });
    }
    expect(h.calls).toHaveLength(0);
  });

  it('accepts the current budget month and the next one', async () => {
    for (const month of [9, 10]) {
      script('movements', 'select', { data: [], error: null });
      script('movements', 'insert', { data: { id: `m-${month}` }, error: null });
      const r = await recordPlannedTransferAction(transfer(2026, month));
      expect(r).toEqual({ ok: true, data: { id: `m-${month}` } });
    }
  });

  it('follows the budget month, not the calendar: October’s salary received on 20 September opens October', async () => {
    const octoberSalary = {
      ...d17Income,
      id: 'm-salary',
      occurredOn: d17Day('2026-09-20'),
      recordedAt: new Date('2026-09-20T08:00:00Z'),
      budgetYear: 2026,
      budgetMonth: 10,
    };
    h.ledger.mockImplementation(async () => ({
      ok: true,
      statements: [],
      movements: [octoberSalary],
    }));
    // Budget month = October: September is now the past, November the next.
    expect(await recordPlannedTransferAction(transfer(2026, 9))).toEqual({
      ok: false,
      errorCode: 'errors.operations.planMonthNotAllowed',
    });
    script('movements', 'select', { data: [], error: null });
    script('movements', 'insert', { data: { id: 'm-nov' }, error: null });
    expect(await recordPlannedTransferAction(transfer(2026, 11))).toEqual({
      ok: true,
      data: { id: 'm-nov' },
    });
  });
});

// =========================================================================
// « Recalculer le découpage » — a transfer to the provisions written before
// the rule `provisionPartOfMonth` (#505) keeps the target as its provisions
// share; the correction rewrites the two parts ONLY.
// =========================================================================
describe('recalculateTransferSplitAction', () => {
  // 840 a year, due in January: 70 a month of provisions in September.
  const CHARGES = [smoothed(840, 'annual', 1)];
  const row = (patch: Record<string, unknown> = {}) => ({
    id: ID,
    kind: 'transfer',
    to_account_type: 'provisions',
    amount: 505,
    plan_year: 2026,
    plan_month: 9,
    provision_part: 505,
    free_savings_part: 0,
    cancelled_at: null,
    ...patch,
  });

  beforeEach(() => {
    h.charges.mockClear();
    h.charges.mockImplementation(async () => CHARGES);
  });
  afterEach(() => {
    h.charges.mockImplementation(async () => []);
  });

  it('rewrites an old split (whole amount in provisions) with the share of the domain rule', async () => {
    script('movements', 'select', { data: row(), error: null });
    script('movements', 'update', { data: [{ id: ID }], error: null });

    const r = await recalculateTransferSplitAction({ id: ID });

    expect(r).toEqual({ ok: true });
    const [read] = h.calls.filter((c) => c.table === 'movements' && c.op === 'select');
    expect(read!.filters).toMatchObject({ id: ID, workspace_id: 'ws-1' });
    const [update] = writes('movements');
    // The two parts ONLY: never the amount, the day, nor the write time.
    expect(update!.payload).toStrictEqual({ provision_part: 70, free_savings_part: 435 });
    expect(update!.filters).toEqual({ id: ID, workspace_id: 'ws-1' });
    expect(h.charges).toHaveBeenCalledWith(h.client, 'ws-1');
  });

  // Security review, tour 56 (I3) — the screen only offers the gesture on the
  // running budget month and the next; the action holds the same line, or a
  // May transfer would be re-split with September's bills.
  it('refuses a transfer of a plan month outside the running month and the next, and writes nothing', async () => {
    script('movements', 'select', { data: row({ plan_month: 5 }), error: null });
    script('movements', 'update', { data: [{ id: ID }], error: null });

    const r = await recalculateTransferSplitAction({ id: ID });

    expect(r).toEqual({ ok: false, errorCode: 'errors.operations.planMonthNotAllowed' });
    expect(writes('movements')).toHaveLength(0);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('audits the correction with ids and fixed states only — no amount', async () => {
    script('movements', 'select', { data: row(), error: null });
    script('movements', 'update', { data: [{ id: ID }], error: null });
    await recalculateTransferSplitAction({ id: ID });
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit.mock.calls[0]).toEqual([
      'movement.recorded',
      { userId: 'user-1', workspaceId: 'ws-1' },
      {
        resource_type: 'movement_transfer',
        resource_id: ID,
        previous_state: 'split_outdated',
        new_state: 'split_by_rule',
      },
    ]);
    expect(JSON.stringify(h.audit.mock.calls)).not.toMatch(/505|435|70/);
  });

  it('is idempotent: a split already equal to the rule writes and audits nothing', async () => {
    script('movements', 'select', {
      data: row({ provision_part: 70, free_savings_part: 435 }),
      error: null,
    });
    expect(await recalculateTransferSplitAction({ id: ID })).toEqual({ ok: true });
    expect(writes('movements')).toHaveLength(0);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('refuses a cancelled transfer, one not to the provisions, an income, and one outside a plan', async () => {
    for (const patch of [
      { cancelled_at: '2026-09-20T10:00:00Z' },
      { to_account_type: 'daily_card', provision_part: null, free_savings_part: null },
      { kind: 'income', provision_part: null, free_savings_part: null },
      { plan_month: null },
      { plan_year: null },
    ]) {
      script('movements', 'select', { data: row(patch), error: null });
      expect(await recalculateTransferSplitAction({ id: ID })).toEqual({
        ok: false,
        errorCode: 'errors.operations.notFound',
      });
    }
    expect(writes('movements')).toHaveLength(0);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('says notFound for an id of another workspace: absent from the read, or zero row updated', async () => {
    script('movements', 'select', { data: null, error: null });
    expect(await recalculateTransferSplitAction({ id: ID })).toEqual({
      ok: false,
      errorCode: 'errors.operations.notFound',
    });
    expect(writes('movements')).toHaveLength(0);

    script('movements', 'select', { data: row(), error: null });
    script('movements', 'update', { data: [], error: null });
    expect(await recalculateTransferSplitAction({ id: ID })).toEqual({
      ok: false,
      errorCode: 'errors.operations.notFound',
    });
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('writes nothing when the charges cannot be read, and returns writeFailed on a database error', async () => {
    h.charges.mockImplementation(async () => null);
    script('movements', 'select', { data: row(), error: null });
    expect(await recalculateTransferSplitAction({ id: ID })).toEqual({
      ok: false,
      errorCode: 'errors.operations.writeFailed',
    });
    expect(writes('movements')).toHaveLength(0);

    script('movements', 'select', { data: null, error: { message: 'x' } });
    expect(await recalculateTransferSplitAction({ id: ID })).toEqual({
      ok: false,
      errorCode: 'errors.operations.writeFailed',
    });

    h.charges.mockImplementation(async () => CHARGES);
    script('movements', 'select', { data: row(), error: null });
    script('movements', 'update', { data: null, error: { message: 'x' } });
    expect(await recalculateTransferSplitAction({ id: ID })).toEqual({
      ok: false,
      errorCode: 'errors.operations.writeFailed',
    });
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('refuses anything but one uuid (no workspace, no amount travels), and a missing session', async () => {
    for (const input of [
      { id: 'abc' },
      { id: ID, workspaceId: 'ws-2' },
      { id: ID, amount: 505 },
      {},
    ]) {
      const r = await recalculateTransferSplitAction(input);
      expect(r).toMatchObject({ ok: false, errorCode: 'errors.validation.generic' });
    }
    h.auth.mockImplementation(async () => ({ ok: false, errorCode: 'errors.session.expired' }));
    expect(await recalculateTransferSplitAction({ id: ID })).toEqual({
      ok: false,
      errorCode: 'errors.session.expired',
    });
    expect(h.calls).toHaveLength(0);
  });
});

// =========================================================================
// Tour 57 — « Corriger le montant » of money received
// =========================================================================
describe('correctIncomeAmountAction', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: ID,
    kind: 'income',
    to_account_type: 'income_bills',
    amount: 505,
    cancelled_at: null,
    ...over,
  });
  const recu = {
    id: ID,
    kind: 'income' as const,
    fromAccountType: null,
    toAccountType: 'income_bills' as const,
    amount: money(505),
    occurredOn: new Date('2026-09-10T00:00:00Z'),
    recordedAt: new Date('2026-09-10T09:00:00Z'),
    cancelledAt: null,
    planYear: null,
    planMonth: null,
    planSuggestedAmount: null,
    provisionPart: null,
    freeSavingsPart: null,
    incomeNature: 'regular' as const,
    budgetYear: null,
    budgetMonth: null,
    description: 'Revenu du mois',
  };
  const releve = (statedOn: string, balance: number) => ({
    ...stmt(balance, statedOn),
    accountType: 'income_bills' as const,
  });

  it.each([0, -5, 12.345, Number.NaN])(
    'refuses the amount %s before any read or write',
    async (amount) => {
      const r = await correctIncomeAmountAction({ id: ID, amount });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.errorCode).toBe('errors.validation.generic');
        expect(r.fieldErrors?.amount?.[0]).toMatch(/^operations\.amount\./);
      }
      expect(h.calls).toHaveLength(0);
    },
  );

  it('refuses a workspaceId or any other field sent by the client', async () => {
    const r = await correctIncomeAmountAction({ id: ID, amount: 550, workspaceId: 'ws-2' });
    expect(r.ok).toBe(false);
    expect(h.calls).toHaveLength(0);
  });

  it('a row outside the session workspace is not found, and nothing is written', async () => {
    script('movements', 'select', { data: null, error: null });
    expect(await correctIncomeAmountAction({ id: ID, amount: 550 })).toEqual({
      ok: false,
      errorCode: 'errors.operations.notFound',
    });
    expect(h.calls[0]!.filters).toMatchObject({ id: ID, workspace_id: 'ws-1' });
    expect(writes('movements')).toHaveLength(0);
  });

  it('a transfer is not money received: refused, nothing written', async () => {
    script('movements', 'select', { data: row({ kind: 'transfer' }), error: null });
    const r = await correctIncomeAmountAction({ id: ID, amount: 550 });
    expect(r).toEqual({ ok: false, errorCode: 'errors.operations.notFound' });
    expect(writes('movements')).toHaveLength(0);
  });

  it('a cancelled row is not corrected (reopen it first)', async () => {
    script('movements', 'select', {
      data: row({ cancelled_at: '2026-09-12T10:00:00Z' }),
      error: null,
    });
    const r = await correctIncomeAmountAction({ id: ID, amount: 550 });
    expect(r).toEqual({ ok: false, errorCode: 'errors.operations.cancelledRow' });
    expect(writes('movements')).toHaveLength(0);
  });

  it('writes the amount and ONLY the amount, in the session workspace, on a standing row', async () => {
    h.ledger.mockImplementation(async () => ({
      ok: true,
      statements: [releve('2026-09-01', 100)],
      movements: [recu],
    }));
    script('movements', 'select', { data: row(), error: null });
    script('movements', 'update', { data: [{ id: ID }], error: null });
    const r = await correctIncomeAmountAction({ id: ID, amount: 550 });
    const [w] = writes('movements');
    expect(w!.payload).toEqual({ amount: 550 });
    expect(w!.filters).toMatchObject({ id: ID, workspace_id: 'ws-1', cancelled_at: null });
    // No statement after the operation: the balance moves, and the screen says from what to what.
    expect(r).toEqual({ ok: true, data: { effet: 'change', avant: 605, apres: 650 } });
    expect(h.audit).toHaveBeenCalledTimes(1);
    const meta = JSON.stringify(h.audit.mock.calls[0]);
    expect(meta).not.toContain('550');
    expect(meta).not.toContain('505');
  });

  it('a statement read after the operation: says the balance does not move, and names its day', async () => {
    h.ledger.mockImplementation(async () => ({
      ok: true,
      statements: [releve('2026-09-01', 100), releve('2026-09-15', 705)],
      movements: [recu],
    }));
    script('movements', 'select', { data: row(), error: null });
    script('movements', 'update', { data: [{ id: ID }], error: null });
    expect(await correctIncomeAmountAction({ id: ID, amount: 550 })).toEqual({
      ok: true,
      // A gap exists, so a statement precedes this one: not the starting balance.
      data: {
        effet: 'ancre',
        releveLe: '2026-09-15',
        depart: false,
        ecart: { avant: 100, apres: 55 },
      },
    });
  });

  it('zero row updated (RLS: not the author) → not found, no audit', async () => {
    h.ledger.mockImplementation(async () => ({ ok: true, statements: [], movements: [recu] }));
    script('movements', 'select', { data: row(), error: null });
    script('movements', 'update', { data: [], error: null });
    expect(await correctIncomeAmountAction({ id: ID, amount: 550 })).toEqual({
      ok: false,
      errorCode: 'errors.operations.notFound',
    });
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('the same amount again writes nothing', async () => {
    script('movements', 'select', { data: row(), error: null });
    expect(await correctIncomeAmountAction({ id: ID, amount: 505 })).toEqual({
      ok: true,
      data: { effet: 'identique' },
    });
    expect(writes('movements')).toHaveLength(0);
  });
});
