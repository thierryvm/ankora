import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  confirmStatementIncludedAction,
  recordBalanceStatementAction,
  recordIncomeAction,
  recordPlannedTransferAction,
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

describe('same-day statement — the question, then the rewrite (D21)', () => {
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

  it('« Non, pas encore » writes the income and leaves the statement alone', async () => {
    h.ledger.mockImplementation(async () => d17Ledger());
    script('movements', 'insert', { data: { id: 'm-new' }, error: null });
    const r = await recordIncomeAction(income({ statementAnswers: { income_bills: 'notYet' } }));
    expect(r.ok).toBe(true);
    expect(writes('movements')).toHaveLength(1);
    expect(writes('account_balance_statements')).toHaveLength(0);
  });

  it('« Oui » writes the income, a copy of the statement after it, then cancels the old one — and nothing else', async () => {
    h.ledger
      .mockImplementationOnce(async () => d17Ledger())
      .mockImplementationOnce(async () => d17Ledger([d17Income]));
    script('movements', 'insert', { data: { id: 'm-new' }, error: null });
    script('account_balance_statements', 'insert', { data: { id: 's-copy' }, error: null });
    script('account_balance_statements', 'update', { data: [{ id: D21_SID }], error: null });

    const r = await recordIncomeAction(income({ statementAnswers: { income_bills: 'included' } }));
    expect(r.ok).toBe(true);

    const [copy, cancel] = writes('account_balance_statements');
    // Same account, same day, same amount; the ids come from the session. The
    // expected balance is measured WITHOUT the rewritten statement: the one
    // before it (200) plus the income of the day (705).
    expect(copy).toMatchObject({ op: 'insert' });
    expect(copy!.payload).toStrictEqual({
      workspace_id: 'ws-1',
      created_by: 'user-1',
      account_type: 'income_bills',
      balance: 905,
      stated_on: '2026-09-21',
      derived_balance: 905,
    });
    expect(cancel).toMatchObject({
      op: 'update',
      filters: { id: D21_SID, workspace_id: 'ws-1', cancelled_at: null },
    });
    expect(Object.keys(cancel!.payload as object)).toEqual(['cancelled_at']);
    // accounts.balance does not move: the balance is the same.
    expect(h.calls.map((c) => `${c.table}.${c.op}`)).toEqual([
      'movements.insert',
      'account_balance_statements.insert',
      'account_balance_statements.update',
    ]);
  });

  it('ignores an answer for an account whose statement is not of that day', async () => {
    h.ledger.mockImplementation(async () => ({
      ok: true,
      statements: [d17Previous],
      movements: [],
    }));
    script('movements', 'insert', { data: { id: 'm-new' }, error: null });
    const r = await recordIncomeAction(income({ statementAnswers: { income_bills: 'included' } }));
    expect(r.ok).toBe(true);
    expect(writes('account_balance_statements')).toHaveLength(0);
  });

  it('does not ask on the day of the starting balance, which is never rewritten', async () => {
    h.ledger.mockImplementation(async () => ({
      ok: true,
      statements: [d17OfTheDay],
      movements: [],
    }));
    script('movements', 'insert', { data: { id: 'm-new' }, error: null });
    const r = await recordIncomeAction(income());
    expect(r.ok).toBe(true);
    expect(writes('account_balance_statements')).toHaveLength(0);
  });

  it('cancels the income it just wrote when the copy of the statement fails, and says so', async () => {
    h.ledger
      .mockImplementationOnce(async () => d17Ledger())
      .mockImplementationOnce(async () => d17Ledger([d17Income]));
    script('movements', 'insert', { data: { id: 'm-new' }, error: null });
    script('account_balance_statements', 'insert', { data: null, error: { message: 'x' } });
    script('movements', 'update', { data: [{ id: 'm-new' }], error: null });

    const r = await recordIncomeAction(income({ statementAnswers: { income_bills: 'included' } }));
    expect(r).toEqual({ ok: false, errorCode: 'errors.operations.writeFailed' });
    expect(writes('movements')[1]).toMatchObject({
      op: 'update',
      filters: { id: 'm-new', workspace_id: 'ws-1' },
    });
    // The old statement was never touched.
    expect(writes('account_balance_statements').filter((c) => c.op === 'update')).toHaveLength(0);
  });

  it('undoes the copy and the income when the old statement refuses to be cancelled', async () => {
    h.ledger
      .mockImplementationOnce(async () => d17Ledger())
      .mockImplementationOnce(async () => d17Ledger([d17Income]));
    script('movements', 'insert', { data: { id: 'm-new' }, error: null });
    script('account_balance_statements', 'insert', { data: { id: 's-copy' }, error: null });
    script('account_balance_statements', 'update', { data: [], error: null });
    script('account_balance_statements', 'update', { data: [{ id: 's-copy' }], error: null });
    script('movements', 'update', { data: [{ id: 'm-new' }], error: null });

    const r = await recordIncomeAction(income({ statementAnswers: { income_bills: 'included' } }));
    expect(r).toEqual({ ok: false, errorCode: 'errors.operations.writeFailed' });
    const updates = writes('account_balance_statements').filter((c) => c.op === 'update');
    expect(updates[1]).toMatchObject({ filters: { id: 's-copy', workspace_id: 'ws-1' } });
    expect(writes('movements')[1]).toMatchObject({ op: 'update', filters: { id: 'm-new' } });
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

describe('confirmStatementIncludedAction — the card of the account (D21)', () => {
  const after = { ...d17Income, id: 'm-after' };

  it('rewrites the statement after the operations of its day, scoped to the session workspace', async () => {
    h.ledger.mockImplementation(async () => d17Ledger([after]));
    script('account_balance_statements', 'insert', { data: { id: 's-copy' }, error: null });
    script('account_balance_statements', 'update', { data: [{ id: D21_SID }], error: null });

    const r = await confirmStatementIncludedAction({ statementId: D21_SID });
    expect(r.ok).toBe(true);
    expect(h.calls.map((c) => `${c.table}.${c.op}`)).toEqual([
      'account_balance_statements.insert',
      'account_balance_statements.update',
    ]);
    expect(writes('account_balance_statements')[0]!.payload).toStrictEqual({
      workspace_id: 'ws-1',
      created_by: 'user-1',
      account_type: 'income_bills',
      balance: 905,
      stated_on: '2026-09-21',
      derived_balance: 905,
    });
    expect(h.ledger).toHaveBeenCalledWith(h.client, 'ws-1');
  });

  it('refuses, writing nothing, a statement absent from the workspace ledger', async () => {
    h.ledger.mockImplementation(async () => ({
      ok: true,
      statements: [d17Previous],
      movements: [after],
    }));
    const r = await confirmStatementIncludedAction({ statementId: D21_SID });
    expect(r).toEqual({ ok: false, errorCode: 'errors.operations.notFound' });
    expect(h.calls).toHaveLength(0);
  });

  it('refuses a cancelled statement, the starting balance, and a day with nothing counted after', async () => {
    const cancelled = d17Statement(D21_SID, 905, '2026-09-21', '2026-09-21T08:00:00Z', true);
    for (const ledger of [
      { statements: [d17Previous, cancelled], movements: [after] },
      { statements: [d17OfTheDay], movements: [after] },
      { statements: [d17Previous, d17OfTheDay], movements: [] },
    ]) {
      h.ledger.mockImplementation(async () => ({ ok: true, ...ledger }));
      const r = await confirmStatementIncludedAction({ statementId: D21_SID });
      expect(r).toEqual({ ok: false, errorCode: 'errors.operations.notFound' });
    }
    expect(h.calls).toHaveLength(0);
  });

  it('refuses anything but one uuid (no workspace, no amount travels)', async () => {
    for (const input of [{ statementId: 'x' }, { statementId: D21_SID, workspaceId: 'ws-2' }, {}]) {
      const r = await confirmStatementIncludedAction(input);
      expect(r.ok).toBe(false);
    }
    expect(h.calls).toHaveLength(0);
  });
});

describe('D21 — what the security review found (2026-09-28)', () => {
  const income = (answer: 'included' | 'notYet') => ({
    toAccountType: 'income_bills',
    amount: 705,
    occurredOn: '2026-09-21',
    nature: 'regular',
    statementAnswers: { income_bills: answer },
  });
  // A transfer of the same day, written AFTER the statement and answered « Non ».
  const earlierTransfer = {
    ...d17Income,
    id: 'm-transfer',
    kind: 'transfer' as const,
    fromAccountType: 'income_bills' as const,
    toAccountType: 'daily_card' as const,
    amount: money(505),
    incomeNature: null,
  };

  it('B1 — refuses « Oui » when another operation of the day already counts after the statement, writing nothing', async () => {
    h.ledger.mockImplementation(async () => d17Ledger([earlierTransfer]));
    const r = await recordIncomeAction(income('included'));
    expect(r).toMatchObject({
      ok: false,
      fieldErrors: { statementAnswers: ['operations.sameDay.othersAfter'] },
    });
    expect(nonSelect()).toHaveLength(0);
  });

  it('B1 — « Non » stays possible on such a day', async () => {
    h.ledger.mockImplementation(async () => d17Ledger([earlierTransfer]));
    script('movements', 'insert', { data: { id: 'm-new' }, error: null });
    const r = await recordIncomeAction(income('notYet'));
    expect(r.ok).toBe(true);
    expect(writes('account_balance_statements')).toHaveLength(0);
  });

  it('I1 — a transfer between two accounts read that day: on the second failure, reopens the first original BEFORE cancelling its copy', async () => {
    const daily = { ...d17OfTheDay, id: 'daily-of-the-day', accountType: 'daily_card' as const };
    const dailyPrev = { ...d17Previous, id: 'daily-prev', accountType: 'daily_card' as const };
    const statements = [d17Previous, d17OfTheDay, dailyPrev, daily];
    const transfer = { ...earlierTransfer, id: 'm-new' };
    h.ledger
      .mockImplementationOnce(async () => ({ ok: true, statements, movements: [] }))
      .mockImplementationOnce(async () => ({ ok: true, statements, movements: [transfer] }));
    script('movements', 'select', { data: [], error: null });
    script('movements', 'insert', { data: { id: 'm-new' }, error: null });
    script('account_balance_statements', 'insert', { data: { id: 'copy-1' }, error: null });
    script('account_balance_statements', 'update', { data: [{ id: D21_SID }], error: null });
    script('account_balance_statements', 'insert', { data: null, error: { message: 'x' } });
    script('account_balance_statements', 'update', { data: [{ id: D21_SID }], error: null });
    script('account_balance_statements', 'update', { data: [{ id: 'copy-1' }], error: null });
    script('movements', 'update', { data: [{ id: 'm-new' }], error: null });

    const r = await recordPlannedTransferAction({
      fromAccountType: 'income_bills',
      toAccountType: 'daily_card',
      amount: 505,
      occurredOn: '2026-09-21',
      planYear: 2026,
      planMonth: 10,
      planSuggestedAmount: 505,
      plannedProvisions: 0,
      statementAnswers: { income_bills: 'included', daily_card: 'included' },
    });
    expect(r).toEqual({ ok: false, errorCode: 'errors.operations.writeFailed' });
    const updates = writes('account_balance_statements').filter((c) => c.op === 'update');
    expect(updates.map((u) => [u.filters.id, u.payload])).toEqual([
      [D21_SID, { cancelled_at: expect.any(String) }],
      [D21_SID, { cancelled_at: null }],
      ['copy-1', { cancelled_at: expect.any(String) }],
    ]);
    expect(writes('movements').at(-1)).toMatchObject({ op: 'update', filters: { id: 'm-new' } });
    // I4 — nothing stood: no statement event was written.
    expect(
      h.audit.mock.calls.filter((c) => (c as unknown[])[0] === 'account.balance_updated'),
    ).toEqual([]);
  });

  it('I4 — audits the copy and the cancel once the gesture stands, ids and states only', async () => {
    h.ledger
      .mockImplementationOnce(async () => d17Ledger())
      .mockImplementationOnce(async () => d17Ledger([d17Income]));
    script('movements', 'insert', { data: { id: 'm-new' }, error: null });
    script('account_balance_statements', 'insert', { data: { id: 's-copy' }, error: null });
    script('account_balance_statements', 'update', { data: [{ id: D21_SID }], error: null });
    const r = await recordIncomeAction(income('included'));
    expect(r.ok).toBe(true);
    const statementEvents = h.audit.mock.calls
      .map((c) => c as unknown[])
      .filter((c) => c[0] === 'account.balance_updated')
      .map((c) => c[2]);
    expect(statementEvents).toEqual([
      { resource_type: 'account_balance_statement', resource_id: 's-copy' },
      {
        resource_type: 'account_balance_statement',
        resource_id: D21_SID,
        previous_state: 'standing',
        new_state: 'cancelled',
      },
    ]);
  });

  it('I2 — keeps the copy when the cancel answer is lost but the original is cancelled', async () => {
    h.ledger.mockImplementation(async () => d17Ledger([{ ...d17Income, id: 'm-after' }]));
    script('account_balance_statements', 'insert', { data: { id: 's-copy' }, error: null });
    script('account_balance_statements', 'update', { data: null, error: { message: 'timeout' } });
    script('account_balance_statements', 'select', {
      data: { cancelled_at: '2026-09-21T10:00:00Z' },
      error: null,
    });
    const r = await confirmStatementIncludedAction({ statementId: D21_SID });
    expect(r.ok).toBe(true);
    expect(writes('account_balance_statements').filter((c) => c.op === 'update')).toHaveLength(1);
  });
});
