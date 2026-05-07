import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TerminalResult =
  | { data: unknown; error: null }
  | { data: null; error: { code?: string; message: string } };

type ScriptedQueue = {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  result: TerminalResult;
};

const { supa, auditSpy, rateLimitSpy } = vi.hoisted(() => {
  const queue: ScriptedQueue[] = [];
  let lastInsert: Record<string, unknown> | undefined;
  let lastUpdate: Record<string, unknown> | undefined;
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
    const builder: Record<string, unknown> = {
      select: vi.fn(() => {
        currentOp = 'select';
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
        return builder;
      }),
      delete: vi.fn(() => {
        currentOp = 'delete';
        return builder;
      }),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lt: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => takeResult(table, currentOp)),
      single: vi.fn(async () => takeResult(table, currentOp)),
      then: (onFulfilled: (v: TerminalResult) => unknown) => {
        const result = takeResult(table, currentOp);
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
        userValue = { id: 'user-1' };
        client.auth.getUser.mockClear();
        client.from.mockClear();
      },
      lastInsertPayload: () => lastInsert,
      lastUpdatePayload: () => lastUpdate,
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
  createAdminClient: async () => supa.client,
}));

vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: {
    CHARGE_CREATED: 'charge.created',
    CHARGE_UPDATED: 'charge.updated',
    CHARGE_DELETED: 'charge.deleted',
    CHARGE_PAYMENT_TOGGLED: 'charge.payment_toggled',
    EXPENSE_CREATED: 'expense.created',
    EXPENSE_UPDATED: 'expense.updated',
    EXPENSE_DELETED: 'expense.deleted',
  },
  logAuditEvent: auditSpy,
}));

vi.mock('@/lib/security/rate-limit', () => ({
  rateLimit: rateLimitSpy,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { updateChargeAction, createChargeAction } from '../charges';

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
