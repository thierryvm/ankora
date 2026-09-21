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
    ledger: vi.fn(async () => ({ ok: true, statements: [] as unknown[], movements: [] })),
  };
});

vi.mock('@/lib/actions/authorized-workspace', () => ({ authorizedWorkspace: h.auth }));
vi.mock('@/lib/security/rate-limit', () => ({ rateLimit: h.rate }));
vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: { ACCOUNT_BALANCE_UPDATED: 'account.balance_updated' },
  logAuditEvent: h.audit,
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));
vi.mock('@/lib/data/operations', () => ({ loadAccountLedger: h.ledger }));
vi.mock('@/lib/data/month-situation', () => ({ todayIsoInBrussels: () => '2026-09-21' }));
vi.mock('@/lib/actions/revalidate', () => ({
  revalidateDashboard: vi.fn(),
  revalidateAppPath: vi.fn(),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) =>
    key === 'defaultRegular' ? 'Revenu du mois' : 'En plus du revenu',
}));

import { money } from '@/lib/domain/types';
import {
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
    script('account_balance_statements', 'update', { data: null, error: null });

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

  it('accepts the figures of a real plan, once rounded to the cent (280/12 + 70/3)', async () => {
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
