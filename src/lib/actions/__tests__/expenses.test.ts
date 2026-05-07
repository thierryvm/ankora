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
      insert: vi.fn(() => {
        currentOp = 'insert';
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
        lastUpdate = undefined;
        userValue = { id: 'user-1' };
        client.auth.getUser.mockClear();
        client.from.mockClear();
      },
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

import { updateExpenseAction } from '../expenses';

const EXPENSE_ID = '10dccda9-7e0f-4b4e-9c7d-23f3c1b7e8a9';

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

describe('updateExpenseAction — id validation', () => {
  it('rejects malformed id with errors.validation.generic', async () => {
    const r = await updateExpenseAction('not-a-uuid', { label: 'X' });
    expect(r).toEqual({ ok: false, errorCode: 'errors.validation.generic' });
    expect(auditSpy).not.toHaveBeenCalled();
  });
});

describe('updateExpenseAction — authz', () => {
  it('returns errors.session.expired when no session', async () => {
    supa.authReturn({ data: { user: null } });
    const r = await updateExpenseAction(EXPENSE_ID, { label: 'X' });
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.expired' });
  });

  it('returns errors.db.workspaceNotFound when no membership', async () => {
    supa.program({
      table: 'workspace_members',
      op: 'select',
      result: { data: null, error: null },
    });
    const r = await updateExpenseAction(EXPENSE_ID, { label: 'X' });
    expect(r).toEqual({ ok: false, errorCode: 'errors.db.workspaceNotFound' });
  });

  it('returns rate-limit error', async () => {
    rateLimitSpy.mockImplementationOnce(async () => ({
      success: false,
      limit: 60,
      remaining: 0,
    }));
    programMembership();
    const r = await updateExpenseAction(EXPENSE_ID, { label: 'X' });
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.rateLimited' });
  });
});

describe('updateExpenseAction — validation', () => {
  it('rejects negative amount', async () => {
    programMembership();
    const r = await updateExpenseAction(EXPENSE_ID, { amount: -1 });
    expect(r.ok).toBe(false);
  });

  it('rejects malformed date', async () => {
    programMembership();
    const r = await updateExpenseAction(EXPENSE_ID, { occurredOn: 'not-a-date' });
    expect(r.ok).toBe(false);
  });

  it('rejects empty label after trim', async () => {
    programMembership();
    const r = await updateExpenseAction(EXPENSE_ID, { label: '   ' });
    expect(r.ok).toBe(false);
  });
});

describe('updateExpenseAction — happy path + audit', () => {
  it('updates fields and emits audit event', async () => {
    programMembership();
    supa.program({
      table: 'expenses',
      op: 'update',
      result: { data: null, error: null },
    });
    const r = await updateExpenseAction(EXPENSE_ID, {
      label: 'Pharmacie',
      amount: 12.5,
      categoryId: null,
      note: 'remboursable',
    });
    expect(r).toEqual({ ok: true });
    expect(supa.lastUpdatePayload()).toMatchObject({
      label: 'Pharmacie',
      amount: 12.5,
      category_id: null,
      note: 'remboursable',
    });
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect((auditSpy.mock.calls as unknown as unknown[][])[0]![0]).toBe('expense.updated');
  });

  it('returns errors.expenses.updateFailed on DB error', async () => {
    programMembership();
    supa.program({
      table: 'expenses',
      op: 'update',
      result: { data: null, error: { message: 'rls denied' } },
    });
    const r = await updateExpenseAction(EXPENSE_ID, { label: 'X' });
    expect(r).toEqual({ ok: false, errorCode: 'errors.expenses.updateFailed' });
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('passes paid_from update through to the DB', async () => {
    programMembership();
    supa.program({
      table: 'expenses',
      op: 'update',
      result: { data: null, error: null },
    });
    await updateExpenseAction(EXPENSE_ID, { paidFrom: 'principal' });
    expect(supa.lastUpdatePayload()).toMatchObject({ paid_from: 'principal' });
  });

  it('passes occurred_on update through to the DB', async () => {
    programMembership();
    supa.program({
      table: 'expenses',
      op: 'update',
      result: { data: null, error: null },
    });
    await updateExpenseAction(EXPENSE_ID, { occurredOn: '2026-05-01' });
    expect(supa.lastUpdatePayload()).toMatchObject({ occurred_on: '2026-05-01' });
  });
});
