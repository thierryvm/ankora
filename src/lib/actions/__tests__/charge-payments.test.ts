import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories run hoisted above top-level `const`. Use `vi.hoisted` so
// the shared mocks exist before the factories execute.
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
  let lastDeleteFilters: Record<string, unknown> | undefined;
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
    const filters: Record<string, unknown> = {};

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
      eq: vi.fn((col: string, value: unknown) => {
        filters[col] = value;
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
        const result = takeResult(table, currentOp);
        if (currentOp === 'delete') lastDeleteFilters = { ...filters };
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
        lastDeleteFilters = undefined;
        userValue = { id: 'user-1' };
        client.auth.getUser.mockClear();
        client.from.mockClear();
      },
      lastInsertPayload: () => lastInsert,
      lastUpdatePayload: () => lastUpdate,
      lastDeleteFilters: () => lastDeleteFilters,
      authReturn: (value: { data: { user: { id: string } | null } }) => {
        userValue = value.data.user;
      },
    },
    auditSpy: vi.fn(async () => {}),
    rateLimitSpy: vi.fn(async () => ({ success: true, limit: 60, remaining: 59 })),
  };
});

// `@/lib/env` parses required env vars at module load and throws if any are
// missing — sidestep it with a stub so transitive imports stay quiet.
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

// Stub the audit-log module wholesale — its real `createAdminClient` import
// would pull in `env` + `log` + supabase ssr, none of which we need here.
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

// Import AFTER mocks so the action's deps resolve to mocked versions.
import { togglePaymentAction } from '../charge-payments';

const VALID_INPUT = {
  chargeId: '10dccda9-7e0f-4b4e-9c7d-23f3c1b7e8a9',
  periodYear: 2026,
  periodMonth: 5,
};

function programMembership(workspaceId = 'ws-1') {
  supa.program({
    table: 'workspace_members',
    op: 'select',
    result: { data: { workspace_id: workspaceId, role: 'owner' }, error: null },
  });
}

describe('togglePaymentAction — authz', () => {
  beforeEach(() => {
    supa.reset();
    auditSpy.mockClear();
    rateLimitSpy.mockClear();
    rateLimitSpy.mockImplementation(async () => ({ success: true, limit: 60, remaining: 59 }));
  });

  it('returns errors.session.expired when no user session', async () => {
    supa.authReturn({ data: { user: null } });
    const r = await togglePaymentAction(VALID_INPUT);
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.expired' });
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('returns errors.db.workspaceNotFound when no membership', async () => {
    supa.program({
      table: 'workspace_members',
      op: 'select',
      result: { data: null, error: null },
    });
    const r = await togglePaymentAction(VALID_INPUT);
    expect(r).toEqual({ ok: false, errorCode: 'errors.db.workspaceNotFound' });
  });

  it('returns errors.session.rateLimited when rate-limit hit', async () => {
    rateLimitSpy.mockImplementationOnce(async () => ({
      success: false,
      limit: 60,
      remaining: 0,
    }));
    programMembership();
    const r = await togglePaymentAction(VALID_INPUT);
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.rateLimited' });
  });
});

describe('togglePaymentAction — validation', () => {
  beforeEach(() => {
    supa.reset();
    auditSpy.mockClear();
    rateLimitSpy.mockClear();
    rateLimitSpy.mockImplementation(async () => ({ success: true, limit: 60, remaining: 59 }));
  });

  it('rejects malformed chargeId (not uuid)', async () => {
    programMembership();
    const r = await togglePaymentAction({ ...VALID_INPUT, chargeId: 'not-a-uuid' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe('errors.validation.generic');
      expect(r.fieldErrors?.chargeId).toBeDefined();
    }
  });

  it('rejects month out of range', async () => {
    programMembership();
    const r = await togglePaymentAction({ ...VALID_INPUT, periodMonth: 13 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.periodMonth).toBeDefined();
  });

  it('rejects year out of range', async () => {
    programMembership();
    const r = await togglePaymentAction({ ...VALID_INPUT, periodYear: 1999 });
    expect(r.ok).toBe(false);
  });

  it('rejects negative paidAmount', async () => {
    programMembership();
    const r = await togglePaymentAction({ ...VALID_INPUT, paidAmount: -1 });
    expect(r.ok).toBe(false);
  });
});

describe('togglePaymentAction — charge ownership check', () => {
  beforeEach(() => {
    supa.reset();
    auditSpy.mockClear();
    rateLimitSpy.mockClear();
    rateLimitSpy.mockImplementation(async () => ({ success: true, limit: 60, remaining: 59 }));
  });

  it("returns errors.charges.notFound when chargeId doesn't belong to the workspace", async () => {
    programMembership();
    supa.program({
      table: 'charges',
      op: 'select',
      result: { data: null, error: null },
    });
    const r = await togglePaymentAction(VALID_INPUT);
    expect(r).toEqual({ ok: false, errorCode: 'errors.charges.notFound' });
    // Must NOT have written anything
    expect(auditSpy).not.toHaveBeenCalled();
  });
});

describe('togglePaymentAction — toggle ON (insert)', () => {
  beforeEach(() => {
    supa.reset();
    auditSpy.mockClear();
    rateLimitSpy.mockClear();
    rateLimitSpy.mockImplementation(async () => ({ success: true, limit: 60, remaining: 59 }));
  });

  it('inserts a new payment row using charge.amount as default', async () => {
    programMembership();
    supa.program({
      table: 'charges',
      op: 'select',
      result: {
        data: { id: VALID_INPUT.chargeId, amount: '800', workspace_id: 'ws-1' },
        error: null,
      },
    });
    supa.program({
      table: 'charge_payments',
      op: 'select',
      result: { data: null, error: null },
    });
    supa.program({
      table: 'charge_payments',
      op: 'insert',
      result: { data: null, error: null },
    });

    const r = await togglePaymentAction(VALID_INPUT);
    expect(r).toEqual({ ok: true, data: { paid: true, paidAmount: 800 } });
    expect(supa.lastInsertPayload()).toMatchObject({
      charge_id: VALID_INPUT.chargeId,
      workspace_id: 'ws-1',
      period_year: 2026,
      period_month: 5,
      paid_amount: 800,
      created_by: 'user-1',
    });
    expect(auditSpy).toHaveBeenCalledTimes(1);
    const auditCall = (auditSpy.mock.calls as unknown as unknown[][])[0]!;
    expect(auditCall[0]).toBe('charge.payment_toggled');
    expect(auditCall[2]).toMatchObject({
      period_year: 2026,
      period_month: 5,
      paid: true,
    });
  });

  it('honors the paidAmount override', async () => {
    programMembership();
    supa.program({
      table: 'charges',
      op: 'select',
      result: {
        data: { id: VALID_INPUT.chargeId, amount: '800', workspace_id: 'ws-1' },
        error: null,
      },
    });
    supa.program({
      table: 'charge_payments',
      op: 'select',
      result: { data: null, error: null },
    });
    supa.program({
      table: 'charge_payments',
      op: 'insert',
      result: { data: null, error: null },
    });

    const r = await togglePaymentAction({ ...VALID_INPUT, paidAmount: 795.5 });
    expect(r).toEqual({ ok: true, data: { paid: true, paidAmount: 795.5 } });
    expect(supa.lastInsertPayload()).toMatchObject({ paid_amount: 795.5 });
  });

  it('returns errors.charges.payments.toggleFailed on insert error', async () => {
    programMembership();
    supa.program({
      table: 'charges',
      op: 'select',
      result: {
        data: { id: VALID_INPUT.chargeId, amount: '800', workspace_id: 'ws-1' },
        error: null,
      },
    });
    supa.program({
      table: 'charge_payments',
      op: 'select',
      result: { data: null, error: null },
    });
    supa.program({
      table: 'charge_payments',
      op: 'insert',
      result: { data: null, error: { message: 'unique constraint violation', code: '23505' } },
    });

    const r = await togglePaymentAction(VALID_INPUT);
    expect(r).toEqual({ ok: false, errorCode: 'errors.charges.payments.toggleFailed' });
    expect(auditSpy).not.toHaveBeenCalled();
  });
});

describe('togglePaymentAction — toggle OFF (delete)', () => {
  beforeEach(() => {
    supa.reset();
    auditSpy.mockClear();
    rateLimitSpy.mockClear();
    rateLimitSpy.mockImplementation(async () => ({ success: true, limit: 60, remaining: 59 }));
  });

  it('deletes the existing payment row', async () => {
    programMembership();
    supa.program({
      table: 'charges',
      op: 'select',
      result: {
        data: { id: VALID_INPUT.chargeId, amount: '800', workspace_id: 'ws-1' },
        error: null,
      },
    });
    supa.program({
      table: 'charge_payments',
      op: 'select',
      result: { data: { id: 'payment-existing-1' }, error: null },
    });
    supa.program({
      table: 'charge_payments',
      op: 'delete',
      result: { data: null, error: null },
    });

    const r = await togglePaymentAction(VALID_INPUT);
    expect(r).toEqual({ ok: true, data: { paid: false, paidAmount: null } });
    expect(supa.lastDeleteFilters()).toMatchObject({
      id: 'payment-existing-1',
      workspace_id: 'ws-1',
    });
    const auditCall = (auditSpy.mock.calls as unknown as unknown[][])[0]!;
    expect(auditCall[2]).toMatchObject({ paid: false });
  });

  it('returns errors.charges.payments.toggleFailed on delete error', async () => {
    programMembership();
    supa.program({
      table: 'charges',
      op: 'select',
      result: {
        data: { id: VALID_INPUT.chargeId, amount: '800', workspace_id: 'ws-1' },
        error: null,
      },
    });
    supa.program({
      table: 'charge_payments',
      op: 'select',
      result: { data: { id: 'payment-existing-1' }, error: null },
    });
    supa.program({
      table: 'charge_payments',
      op: 'delete',
      result: { data: null, error: { message: 'rls policy denied' } },
    });

    const r = await togglePaymentAction(VALID_INPUT);
    expect(r).toEqual({ ok: false, errorCode: 'errors.charges.payments.toggleFailed' });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
