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
    COMMITMENT_CREATED: 'commitment.created',
    COMMITMENT_UPDATED: 'commitment.updated',
    COMMITMENT_DELETED: 'commitment.deleted',
    COMMITMENT_PAYMENT_TOGGLED: 'commitment.payment_toggled',
    CHARGE_UPDATED: 'charge.updated',
    CHARGE_DELETED: 'charge.deleted',
    CHARGE_PAYMENT_TOGGLED: 'charge.payment_toggled',
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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import {
  createCommitmentAction,
  deleteCommitmentAction,
  toggleCommitmentPaymentAction,
} from '../commitments';

const COMMITMENT_ID = '10dccda9-7e0f-4b4e-9c7d-23f3c1b7e8a9';

const VALID_INPUT = {
  label: 'Crédit voiture',
  kind: 'debt' as const,
  totalAmount: 4200,
  installmentAmount: 250,
  installmentsTotal: 17,
  startYear: 2026,
  startMonth: 8,
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

describe('createCommitmentAction', () => {
  it('inserts the snake_case row and emits the audit event', async () => {
    programMembership();
    supa.program({ table: 'commitments', op: 'insert', result: { data: null, error: null } });
    const r = await createCommitmentAction(VALID_INPUT);
    expect(r).toEqual({ ok: true });
    expect(supa.lastInsertPayload()).toMatchObject({
      workspace_id: 'ws-1',
      created_by: 'user-1',
      kind: 'debt',
      total_amount: 4200,
      installment_amount: 250,
      installments_total: 17,
      start_year: 2026,
      start_month: 8,
    });
    expect(auditSpy).toHaveBeenCalledWith('commitment.created', {
      userId: 'user-1',
      workspaceId: 'ws-1',
    });
  });

  it('stores a null instalment amount for a one-off', async () => {
    programMembership();
    supa.program({ table: 'commitments', op: 'insert', result: { data: null, error: null } });
    await createCommitmentAction({
      label: 'Entretien',
      kind: 'one_off',
      totalAmount: 340,
      installmentsTotal: 1,
      startYear: 2026,
      startMonth: 10,
    });
    expect(supa.lastInsertPayload()).toMatchObject({ installment_amount: null });
  });

  it('rejects invalid input before touching the DB', async () => {
    programMembership();
    const r = await createCommitmentAction({ ...VALID_INPUT, totalAmount: -1 });
    expect(r.ok).toBe(false);
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('returns the rate-limit error when blocked', async () => {
    programMembership();
    rateLimitSpy.mockImplementation(async () => ({ success: false, limit: 60, remaining: 0 }));
    const r = await createCommitmentAction(VALID_INPUT);
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.rateLimited' });
  });
});

describe('deleteCommitmentAction', () => {
  it('rejects a malformed id before any DB access', async () => {
    const r = await deleteCommitmentAction('not-a-uuid');
    expect(r).toEqual({ ok: false, errorCode: 'errors.validation.generic' });
  });

  it('deletes and audits', async () => {
    programMembership();
    supa.program({ table: 'commitments', op: 'delete', result: { data: null, error: null } });
    const r = await deleteCommitmentAction(COMMITMENT_ID);
    expect(r).toEqual({ ok: true });
    expect(auditSpy).toHaveBeenCalledWith('commitment.deleted', {
      userId: 'user-1',
      workspaceId: 'ws-1',
    });
  });
});

describe('toggleCommitmentPaymentAction', () => {
  const period = { commitmentId: COMMITMENT_ID, periodYear: 2026, periodMonth: 8 };

  it('inserts a tick with the instalment amount read from the commitment (never the client)', async () => {
    programMembership();
    supa.program({
      table: 'commitments',
      op: 'select',
      result: {
        data: { total_amount: 4200, installment_amount: 250, installments_total: 17 },
        error: null,
      },
    });
    supa.program({
      table: 'commitment_payments',
      op: 'select',
      result: { data: null, error: null },
    });
    supa.program({
      table: 'commitment_payments',
      op: 'insert',
      result: { data: null, error: null },
    });
    const r = await toggleCommitmentPaymentAction(period);
    expect(r).toEqual({ ok: true, data: { paid: true } });
    expect(supa.lastInsertPayload()).toMatchObject({ paid_amount: 250, workspace_id: 'ws-1' });
  });

  it('uses the full total for a one-off (no instalment amount stored)', async () => {
    programMembership();
    supa.program({
      table: 'commitments',
      op: 'select',
      result: {
        data: { total_amount: 340, installment_amount: null, installments_total: 1 },
        error: null,
      },
    });
    supa.program({
      table: 'commitment_payments',
      op: 'select',
      result: { data: null, error: null },
    });
    supa.program({
      table: 'commitment_payments',
      op: 'insert',
      result: { data: null, error: null },
    });
    await toggleCommitmentPaymentAction(period);
    expect(supa.lastInsertPayload()).toMatchObject({ paid_amount: 340 });
  });

  it('deletes the tick when one already exists (idempotent toggle)', async () => {
    programMembership();
    supa.program({
      table: 'commitments',
      op: 'select',
      result: {
        data: { total_amount: 4200, installment_amount: 250, installments_total: 17 },
        error: null,
      },
    });
    supa.program({
      table: 'commitment_payments',
      op: 'select',
      result: { data: { id: 'pay-1' }, error: null },
    });
    supa.program({
      table: 'commitment_payments',
      op: 'delete',
      result: { data: null, error: null },
    });
    const r = await toggleCommitmentPaymentAction(period);
    expect(r).toEqual({ ok: true, data: { paid: false } });
  });

  it('refuses a commitment from another workspace (authz)', async () => {
    programMembership();
    // RLS + the workspace_id filter make a foreign row invisible.
    supa.program({ table: 'commitments', op: 'select', result: { data: null, error: null } });
    const r = await toggleCommitmentPaymentAction(period);
    expect(r).toEqual({ ok: false, errorCode: 'errors.commitments.payments.toggleFailed' });
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('rejects a malformed payload', async () => {
    programMembership();
    const r = await toggleCommitmentPaymentAction({ ...period, periodMonth: 13 });
    expect(r).toEqual({ ok: false, errorCode: 'errors.validation.generic' });
  });
});
