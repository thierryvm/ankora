import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TerminalResult =
  { data: unknown; error: null } | { data: null; error: { code?: string; message: string } };

type ScriptedQueue = {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  result: TerminalResult;
};

const { supa, auditSpy, rateLimitSpy } = vi.hoisted(() => {
  const queue: ScriptedQueue[] = [];
  let lastInsert: Record<string, unknown> | undefined;
  let lastUpdate: Record<string, unknown> | undefined;
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const eqCalls: Array<{ table: string; op: string; column: string; value: unknown }> = [];
  // Every write, in the order it reached the database.
  const writeOrder: string[] = [];
  let userValue: { id: string } | null = { id: 'user-1' };

  function takeResult(table: string, op: ScriptedQueue['op']): TerminalResult {
    const idx = queue.findIndex((q) => q.table === table && q.op === op);
    if (idx === -1) {
      throw new Error(
        `supabase-mock: no scripted result for ${table}.${op}() — queue=${JSON.stringify(queue)}`,
      );
    }
    const [entry] = queue.splice(idx, 1);
    return entry!.result;
  }

  function buildBuilder(table: string) {
    let currentOp: ScriptedQueue['op'] = 'select';
    // PostgREST returns rows from a write only when `.select()` follows it.
    let returning = false;
    const builder: Record<string, unknown> = {
      // After a write, `.select()` is PostgREST's « returning »: the op stays
      // the write's.
      select: vi.fn(() => {
        if (currentOp !== 'insert' && currentOp !== 'update' && currentOp !== 'delete') {
          currentOp = 'select';
        } else {
          returning = true;
        }
        return builder;
      }),
      insert: vi.fn((payload: Record<string, unknown>) => {
        currentOp = 'insert';
        lastInsert = payload;
        return builder;
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        currentOp = 'update';
        lastUpdate = payload;
        updates.push({ table, payload });
        writeOrder.push(`${table}.update`);
        return builder;
      }),
      delete: vi.fn(() => {
        currentOp = 'delete';
        return builder;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        eqCalls.push({ table, op: currentOp, column, value });
        return builder;
      }),
      in: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lt: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => takeResult(table, currentOp)),
      single: vi.fn(async () => takeResult(table, currentOp)),
      then: (onFulfilled: (v: TerminalResult) => unknown) => {
        const scripted = takeResult(table, currentOp);
        const result: TerminalResult =
          currentOp !== 'select' && !returning && scripted.error === null
            ? { data: null, error: null }
            : scripted;
        return Promise.resolve(result).then(onFulfilled);
      },
    };
    return builder;
  }

  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: userValue } })),
    },
    from: vi.fn((table: string) => buildBuilder(table)),
  };

  return {
    supa: {
      get client() {
        return client;
      },
      program: (entry: ScriptedQueue) => queue.push(entry),
      reset: () => {
        queue.length = 0;
        lastInsert = undefined;
        lastUpdate = undefined;
        updates.length = 0;
        eqCalls.length = 0;
        writeOrder.length = 0;
        userValue = { id: 'user-1' };
        client.auth.getUser.mockClear();
        client.from.mockClear();
      },
      lastInsertPayload: () => lastInsert,
      lastUpdatePayload: () => lastUpdate,
      writeOrder: () => [...writeOrder],
      updatesOn: (table: string) => updates.filter((u) => u.table === table),
      eqCallsOn: (table: string, op: string) =>
        eqCalls.filter((c) => c.table === table && c.op === op),
      authReturn: (value: { data: { user: { id: string } | null } }) => {
        userValue = value.data.user;
      },
    },
    auditSpy: vi.fn(async () => {}),
    rateLimitSpy: vi.fn(async () => ({ success: true, limit: 60, remaining: 59 })),
  };
});

vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_APP_ENV: 'development',
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    INTERNAL_SECRET: 'a'.repeat(32),
  },
  clientEnv: {
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_APP_ENV: 'development',
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supa.client,
}));

vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: {
    CHARGE_CREATED: 'charge.created',
    CHARGE_UPDATED: 'charge.updated',
    CHARGE_DELETED: 'charge.deleted',
    CHARGE_PAYMENT_TOGGLED: 'charge.payment_toggled',
    CHARGE_PAYMENT_AMOUNT_FOLLOWED: 'charge.payment_amount_followed',
    CHARGE_WATCH_TOGGLED: 'charge.watch_toggled',
    EXPENSE_CREATED: 'expense.created',
    EXPENSE_UPDATED: 'expense.updated',
    EXPENSE_DELETED: 'expense.deleted',
  },
  logAuditEvent: auditSpy,
}));

vi.mock('@/lib/security/rate-limit', () => ({
  rateLimit: rateLimitSpy,
}));

// « Today » in Brussels is pinned: the current period is October 2026.
vi.mock('@/lib/date/tz', () => ({
  ANKORA_TIMEZONE: 'Europe/Brussels',
  todayInAnkoraTz: () => '2026-10-02',
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { updateChargeAction, createChargeAction, toggleWatchAction } from '../charges';

const CHARGE_ID = '10dccda9-7e0f-4b4e-9c7d-23f3c1b7e8a9';

const VALID_CREATE_INPUT = {
  label: 'Loyer',
  amount: 800,
  frequency: 'monthly' as const,
  dueMonth: 1,
  categoryId: null,
  isActive: true,
};

function programMembership() {
  supa.program({
    table: 'workspace_members',
    op: 'select',
    result: { data: { workspace_id: 'ws-1', role: 'owner' }, error: null },
  });
}

beforeEach(() => {
  supa.reset();
  auditSpy.mockClear();
  rateLimitSpy.mockClear();
  rateLimitSpy.mockImplementation(async () => ({ success: true, limit: 60, remaining: 59 }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createChargeAction — paymentMonths/paymentDay/sortOrder pass-through', () => {
  it('inserts payment_months sorted + de-duplicated when supplied', async () => {
    programMembership();
    supa.program({
      table: 'charges',
      op: 'insert',
      result: { data: null, error: null },
    });
    const r = await createChargeAction({
      ...VALID_CREATE_INPUT,
      paymentMonths: [12, 3, 6, 3, 9],
      paymentDay: 15,
      sortOrder: 5,
    });
    expect(r).toEqual({ ok: true });
    expect(supa.lastInsertPayload()).toMatchObject({
      payment_months: [3, 6, 9, 12],
      payment_day: 15,
      sort_order: 5,
    });
  });

  it('omits payment_months when not supplied (DB default kicks in)', async () => {
    programMembership();
    supa.program({
      table: 'charges',
      op: 'insert',
      result: { data: null, error: null },
    });
    await createChargeAction(VALID_CREATE_INPUT);
    const payload = supa.lastInsertPayload();
    expect(payload).toBeDefined();
    expect(payload).not.toHaveProperty('payment_months');
    expect(payload).not.toHaveProperty('payment_day');
    expect(payload).not.toHaveProperty('sort_order');
  });
});

describe('updateChargeAction — id validation', () => {
  it('rejects malformed id with errors.validation.generic', async () => {
    const r = await updateChargeAction('not-a-uuid', { label: 'X' });
    expect(r).toEqual({ ok: false, errorCode: 'errors.validation.generic' });
    // Must short-circuit BEFORE any DB / auth call
    expect(auditSpy).not.toHaveBeenCalled();
  });
});

describe('updateChargeAction — authz', () => {
  it('returns errors.session.expired when no session', async () => {
    supa.authReturn({ data: { user: null } });
    const r = await updateChargeAction(CHARGE_ID, { label: 'Renamed' });
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.expired' });
  });

  it('returns errors.db.workspaceNotFound when no membership', async () => {
    supa.program({
      table: 'workspace_members',
      op: 'select',
      result: { data: null, error: null },
    });
    const r = await updateChargeAction(CHARGE_ID, { label: 'Renamed' });
    expect(r).toEqual({ ok: false, errorCode: 'errors.db.workspaceNotFound' });
  });

  it('returns rate-limit error when blocked', async () => {
    rateLimitSpy.mockImplementationOnce(async () => ({
      success: false,
      limit: 60,
      remaining: 0,
    }));
    programMembership();
    const r = await updateChargeAction(CHARGE_ID, { label: 'Renamed' });
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.rateLimited' });
  });
});

describe('updateChargeAction — validation', () => {
  it('rejects negative amount', async () => {
    programMembership();
    const r = await updateChargeAction(CHARGE_ID, { amount: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe('errors.validation.generic');
  });

  it('rejects empty paymentMonths', async () => {
    programMembership();
    const r = await updateChargeAction(CHARGE_ID, { paymentMonths: [] });
    expect(r.ok).toBe(false);
  });

  it('rejects paymentDay 0', async () => {
    programMembership();
    const r = await updateChargeAction(CHARGE_ID, { paymentDay: 0 });
    expect(r.ok).toBe(false);
  });

  it('rejects negative sortOrder', async () => {
    programMembership();
    const r = await updateChargeAction(CHARGE_ID, { sortOrder: -1 });
    expect(r.ok).toBe(false);
  });
});

describe('updateChargeAction — paymentMonths mirrors due_month', () => {
  it('writes payment_months sorted + due_month = paymentMonths[0]', async () => {
    programMembership();
    supa.program({
      table: 'charges',
      op: 'update',
      result: { data: null, error: null },
    });
    const r = await updateChargeAction(CHARGE_ID, {
      paymentMonths: [12, 3, 6, 9],
      paymentDay: 15,
    });
    expect(r).toEqual({ ok: true });
    expect(supa.lastUpdatePayload()).toMatchObject({
      payment_months: [3, 6, 9, 12],
      payment_day: 15,
      due_month: 3,
    });
  });

  it('does NOT touch due_month when paymentMonths is omitted', async () => {
    programMembership();
    supa.program({
      table: 'charges',
      op: 'update',
      result: { data: null, error: null },
    });
    await updateChargeAction(CHARGE_ID, { label: 'Renamed' });
    const payload = supa.lastUpdatePayload();
    expect(payload).toMatchObject({ label: 'Renamed' });
    expect(payload).not.toHaveProperty('due_month');
    expect(payload).not.toHaveProperty('payment_months');
  });

  it('honors explicit dueMonth when paymentMonths NOT supplied', async () => {
    programMembership();
    supa.program({
      table: 'charges',
      op: 'update',
      result: { data: null, error: null },
    });
    await updateChargeAction(CHARGE_ID, { dueMonth: 7 });
    expect(supa.lastUpdatePayload()).toMatchObject({ due_month: 7 });
  });

  it('paymentMonths overrides explicit dueMonth (paymentMonths is canonical)', async () => {
    programMembership();
    supa.program({
      table: 'charges',
      op: 'update',
      result: { data: null, error: null },
    });
    await updateChargeAction(CHARGE_ID, {
      paymentMonths: [11],
      dueMonth: 7,
    });
    expect(supa.lastUpdatePayload()).toMatchObject({
      payment_months: [11],
      due_month: 11,
    });
  });
});

describe('updateChargeAction — happy path + audit', () => {
  it('updates label + amount and emits audit event', async () => {
    programMembership();
    // An amount change reads the bill's current amount, then this month's
    // payment (none here).
    supa.program({
      table: 'charges',
      op: 'select',
      result: { data: { amount: 800 }, error: null },
    });
    supa.program({ table: 'charge_payments', op: 'select', result: { data: null, error: null } });
    supa.program({
      table: 'charges',
      op: 'update',
      result: { data: null, error: null },
    });
    const r = await updateChargeAction(CHARGE_ID, {
      label: 'New label',
      amount: 850.5,
    });
    expect(r).toEqual({ ok: true });
    expect(supa.lastUpdatePayload()).toMatchObject({
      label: 'New label',
      amount: 850.5,
    });
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect((auditSpy.mock.calls as unknown as unknown[][])[0]![0]).toBe('charge.updated');
  });

  // A patch that does not carry isActive must not write is_active: the create
  // default (true) used to come back out of the partial schema and re-activate
  // a deactivated bill on any edit. `toStrictEqual`, because the
  // `toMatchObject` above is exactly what let the extra column through.
  it('a label-only patch writes the label and nothing else', async () => {
    programMembership();
    supa.program({ table: 'charges', op: 'update', result: { data: null, error: null } });
    const r = await updateChargeAction(CHARGE_ID, { label: 'Loyer' });
    expect(r).toEqual({ ok: true });
    expect(supa.lastUpdatePayload()).toStrictEqual({ label: 'Loyer' });
  });

  it('an explicit null still clears the category and the note', async () => {
    programMembership();
    supa.program({ table: 'charges', op: 'update', result: { data: null, error: null } });
    const r = await updateChargeAction(CHARGE_ID, { categoryId: null, notes: null });
    expect(r).toEqual({ ok: true });
    expect(supa.lastUpdatePayload()).toStrictEqual({ category_id: null, notes: null });
  });

  it('returns errors.charges.updateFailed on DB error', async () => {
    programMembership();
    supa.program({
      table: 'charges',
      op: 'update',
      result: { data: null, error: { message: 'rls denied' } },
    });
    const r = await updateChargeAction(CHARGE_ID, { label: 'X' });
    expect(r).toEqual({ ok: false, errorCode: 'errors.charges.updateFailed' });
    expect(auditSpy).not.toHaveBeenCalled();
  });
});

// A bill ticked « payée » this month was recorded at the bill's amount of that
// moment. Correcting the bill's amount afterwards must carry that payment
// along — or say plainly why it did not. Figures are fictitious (505 / 705).
describe('updateChargeAction — the payment of the current month follows the amount', () => {
  const PAYMENT_ID = '2b7d4c1e-9f3a-4e6b-8c5d-1a2b3c4d5e6f';

  function programChargeRead(amount: number) {
    supa.program({ table: 'charges', op: 'select', result: { data: { amount }, error: null } });
  }

  it('a payment recorded at the old amount takes the new amount, and is audited', async () => {
    programMembership();
    programChargeRead(505);
    supa.program({
      table: 'charge_payments',
      op: 'select',
      result: { data: { id: PAYMENT_ID, paid_amount: 505 }, error: null },
    });
    supa.program({ table: 'charges', op: 'update', result: { data: null, error: null } });
    supa.program({
      table: 'charge_payments',
      op: 'update',
      result: { data: [{ id: PAYMENT_ID }], error: null },
    });

    const r = await updateChargeAction(CHARGE_ID, { amount: 705 });

    expect(r).toEqual({
      ok: true,
      payment: { kind: 'followed', periodYear: 2026, periodMonth: 10, paidAmount: 705 },
    });
    expect(supa.updatesOn('charge_payments')).toEqual([
      { table: 'charge_payments', payload: { paid_amount: 705 } },
    ]);
    // The write is scoped to the caller's workspace, this period, and only
    // while the payment still carries the old default amount.
    const filters = supa.eqCallsOn('charge_payments', 'update');
    expect(filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ column: 'id', value: PAYMENT_ID }),
        expect.objectContaining({ column: 'workspace_id', value: 'ws-1' }),
        expect.objectContaining({ column: 'charge_id', value: CHARGE_ID }),
        expect.objectContaining({ column: 'period_year', value: 2026 }),
        expect.objectContaining({ column: 'period_month', value: 10 }),
        expect.objectContaining({ column: 'paid_amount', value: 505 }),
      ]),
    );
    expect(auditSpy).toHaveBeenCalledWith(
      'charge.payment_amount_followed',
      { userId: 'user-1', workspaceId: 'ws-1' },
      {
        resource_type: 'charge_payment',
        resource_id: PAYMENT_ID,
        period_year: 2026,
        period_month: 10,
      },
    );
    // The bill first: a bill that fails to update leaves its payment alone.
    expect(supa.writeOrder()).toEqual(['charges.update', 'charge_payments.update']);
  });

  it('a bill that fails to update leaves its payment untouched', async () => {
    programMembership();
    programChargeRead(505);
    supa.program({
      table: 'charge_payments',
      op: 'select',
      result: { data: { id: PAYMENT_ID, paid_amount: 505 }, error: null },
    });
    supa.program({
      table: 'charges',
      op: 'update',
      result: { data: null, error: { message: 'rls denied' } },
    });

    const r = await updateChargeAction(CHARGE_ID, { amount: 705 });

    expect(r).toEqual({ ok: false, errorCode: 'errors.charges.updateFailed' });
    expect(supa.updatesOn('charge_payments')).toEqual([]);
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('reads the payment of the current Brussels period, in the caller workspace', async () => {
    programMembership();
    programChargeRead(505);
    supa.program({ table: 'charge_payments', op: 'select', result: { data: null, error: null } });
    supa.program({ table: 'charges', op: 'update', result: { data: null, error: null } });

    const r = await updateChargeAction(CHARGE_ID, { amount: 705 });

    expect(r).toEqual({ ok: true });
    expect(supa.eqCallsOn('charge_payments', 'select')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ column: 'charge_id', value: CHARGE_ID }),
        expect.objectContaining({ column: 'workspace_id', value: 'ws-1' }),
        expect.objectContaining({ column: 'period_year', value: 2026 }),
        expect.objectContaining({ column: 'period_month', value: 10 }),
      ]),
    );
    // A past month is never read, so never rewritten.
    expect(supa.updatesOn('charge_payments')).toEqual([]);
  });

  it('a payment at an amount typed by hand does not move, and the answer says so', async () => {
    programMembership();
    programChargeRead(505);
    supa.program({
      table: 'charge_payments',
      op: 'select',
      result: { data: { id: PAYMENT_ID, paid_amount: 480 }, error: null },
    });
    supa.program({ table: 'charges', op: 'update', result: { data: null, error: null } });

    const r = await updateChargeAction(CHARGE_ID, { amount: 705 });

    expect(r).toEqual({
      ok: true,
      payment: { kind: 'kept', periodYear: 2026, periodMonth: 10, paidAmount: 480 },
    });
    expect(supa.updatesOn('charge_payments')).toEqual([]);
    expect(auditSpy).not.toHaveBeenCalledWith(
      'charge.payment_amount_followed',
      expect.anything(),
      expect.anything(),
    );
  });

  it('an unchanged amount reads no payment and writes none', async () => {
    programMembership();
    programChargeRead(505);
    supa.program({ table: 'charges', op: 'update', result: { data: null, error: null } });

    const r = await updateChargeAction(CHARGE_ID, { amount: 505, label: 'Assurance' });

    expect(r).toEqual({ ok: true });
    expect(supa.client.from).not.toHaveBeenCalledWith('charge_payments');
  });

  it('a bill of another workspace: nothing is written at all', async () => {
    programMembership();
    // RLS + the workspace_id filter → the foreign bill is invisible.
    supa.program({ table: 'charges', op: 'select', result: { data: null, error: null } });

    const r = await updateChargeAction(CHARGE_ID, { amount: 705 });

    expect(r).toEqual({ ok: false, errorCode: 'errors.charges.notFound' });
    expect(supa.updatesOn('charges')).toEqual([]);
    expect(supa.updatesOn('charge_payments')).toEqual([]);
    expect(supa.eqCallsOn('charges', 'select')).toEqual(
      expect.arrayContaining([expect.objectContaining({ column: 'workspace_id', value: 'ws-1' })]),
    );
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('a failed read of the payment writes nothing and names the failure', async () => {
    programMembership();
    programChargeRead(505);
    supa.program({
      table: 'charge_payments',
      op: 'select',
      result: { data: null, error: { message: 'timeout' } },
    });

    const r = await updateChargeAction(CHARGE_ID, { amount: 705 });

    expect(r).toEqual({ ok: false, errorCode: 'errors.charges.payments.readFailed' });
    expect(supa.updatesOn('charges')).toEqual([]);
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('a failed read of the bill writes nothing', async () => {
    programMembership();
    supa.program({
      table: 'charges',
      op: 'select',
      result: { data: null, error: { message: 'timeout' } },
    });

    const r = await updateChargeAction(CHARGE_ID, { amount: 705 });

    expect(r).toEqual({ ok: false, errorCode: 'errors.charges.updateFailed' });
    expect(supa.updatesOn('charges')).toEqual([]);
  });

  it('a payment update that touches no row is not announced as followed', async () => {
    programMembership();
    programChargeRead(505);
    supa.program({
      table: 'charge_payments',
      op: 'select',
      result: { data: { id: PAYMENT_ID, paid_amount: 505 }, error: null },
    });
    supa.program({ table: 'charges', op: 'update', result: { data: null, error: null } });
    // Changed or removed by another tab between the read and the write.
    supa.program({ table: 'charge_payments', op: 'update', result: { data: [], error: null } });

    const r = await updateChargeAction(CHARGE_ID, { amount: 705 });

    expect(r).toEqual({
      ok: true,
      payment: { kind: 'unchanged', periodYear: 2026, periodMonth: 10, paidAmount: 505 },
    });
    expect(auditSpy).not.toHaveBeenCalledWith(
      'charge.payment_amount_followed',
      expect.anything(),
      expect.anything(),
    );
  });

  it('a failed payment write is not announced as followed either', async () => {
    programMembership();
    programChargeRead(505);
    supa.program({
      table: 'charge_payments',
      op: 'select',
      result: { data: { id: PAYMENT_ID, paid_amount: 505 }, error: null },
    });
    supa.program({ table: 'charges', op: 'update', result: { data: null, error: null } });
    supa.program({
      table: 'charge_payments',
      op: 'update',
      result: { data: null, error: { message: 'rls denied' } },
    });

    const r = await updateChargeAction(CHARGE_ID, { amount: 705 });

    expect(r).toEqual({
      ok: true,
      payment: { kind: 'unchanged', periodYear: 2026, periodMonth: 10, paidAmount: 505 },
    });
  });
});

describe('toggleWatchAction — THI-329 PR-C', () => {
  it('flips is_watched, returns the new state, and emits the audit event', async () => {
    programMembership();
    supa.program({
      table: 'charges',
      op: 'select',
      result: { data: { is_watched: false }, error: null },
    });
    supa.program({ table: 'charges', op: 'update', result: { data: null, error: null } });
    const r = await toggleWatchAction(CHARGE_ID);
    expect(r).toEqual({ ok: true, data: { watched: true } });
    expect(supa.lastUpdatePayload()).toEqual({ is_watched: true });
    expect(auditSpy).toHaveBeenCalledWith('charge.watch_toggled', {
      userId: 'user-1',
      workspaceId: 'ws-1',
    });
  });

  it('unwatches an already-watched charge', async () => {
    programMembership();
    supa.program({
      table: 'charges',
      op: 'select',
      result: { data: { is_watched: true }, error: null },
    });
    supa.program({ table: 'charges', op: 'update', result: { data: null, error: null } });
    const r = await toggleWatchAction(CHARGE_ID);
    expect(r).toEqual({ ok: true, data: { watched: false } });
    expect(supa.lastUpdatePayload()).toEqual({ is_watched: false });
  });

  it('rejects a malformed id before any DB access', async () => {
    const r = await toggleWatchAction('not-a-uuid');
    expect(r).toEqual({ ok: false, errorCode: 'errors.validation.generic' });
  });

  it('returns watchFailed when the charge is not in the caller workspace (authz)', async () => {
    programMembership();
    // RLS + workspace_id filter → no row visible for a foreign charge.
    supa.program({ table: 'charges', op: 'select', result: { data: null, error: null } });
    const r = await toggleWatchAction(CHARGE_ID);
    expect(r).toEqual({ ok: false, errorCode: 'errors.charges.watchFailed' });
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('returns watchFailed on a DB error during the update', async () => {
    programMembership();
    supa.program({
      table: 'charges',
      op: 'select',
      result: { data: { is_watched: false }, error: null },
    });
    supa.program({
      table: 'charges',
      op: 'update',
      result: { data: null, error: { message: 'rls denied' } },
    });
    const r = await toggleWatchAction(CHARGE_ID);
    expect(r).toEqual({ ok: false, errorCode: 'errors.charges.watchFailed' });
    expect(auditSpy).not.toHaveBeenCalled();
  });
});
