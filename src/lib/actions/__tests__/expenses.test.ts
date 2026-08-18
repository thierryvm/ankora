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
  let lastUpdate: Record<string, unknown> | undefined;
  let lastInsert: Record<string, unknown> | undefined;
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
        // Captured symmetrically with `update`: without it there is no way to
        // assert what create actually writes, which is exactly where a dropped
        // column hides.
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
      lastInsertPayload: () => lastInsert,
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

import { createExpenseAction, deleteExpenseAction, updateExpenseAction } from '../expenses';

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

// ─────────────────────────────────────────────────────────────────────────────
// createExpenseAction / deleteExpenseAction
//
// `tests/actions/expenses.test.ts` already covers these two — but it pins the
// `revalidatePath` contract, not the authorisation boundaries. Create is the
// most-used path in the whole app and delete is the only irreversible one;
// neither had a single test proving that a caller without a session, without a
// membership, or over the rate limit is turned away. That is what the tables
// below establish, mirroring the `updateExpenseAction` ones so a future reader
// can diff the three and see they hold the same contract.
// ─────────────────────────────────────────────────────────────────────────────

// `categoryId` and `note` are nullable but NOT optional in the schema — omit
// them and Zod rejects the payload before the action ever reaches the INSERT.
const VALID_EXPENSE = {
  label: 'Delhaize',
  amount: 42.3,
  occurredOn: '2026-07-18',
  categoryId: null,
  note: null,
};

describe('createExpenseAction — authz', () => {
  it('returns errors.session.expired when no session', async () => {
    supa.authReturn({ data: { user: null } });
    const r = await createExpenseAction(VALID_EXPENSE);
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.expired' });
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('returns errors.db.workspaceNotFound when no membership', async () => {
    supa.program({ table: 'workspace_members', op: 'select', result: { data: null, error: null } });
    const r = await createExpenseAction(VALID_EXPENSE);
    expect(r).toEqual({ ok: false, errorCode: 'errors.db.workspaceNotFound' });
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('returns the rate-limit error before touching the database', async () => {
    rateLimitSpy.mockImplementationOnce(async () => ({ success: false, limit: 60, remaining: 0 }));
    programMembership();
    const r = await createExpenseAction(VALID_EXPENSE);
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.rateLimited' });
    expect(supa.lastInsertPayload()).toBeUndefined();
  });
});

describe('createExpenseAction — validation', () => {
  it('rejects a negative amount', async () => {
    programMembership();
    const r = await createExpenseAction({ ...VALID_EXPENSE, amount: -1 });
    expect(r.ok).toBe(false);
  });

  it('rejects a malformed date', async () => {
    programMembership();
    const r = await createExpenseAction({ ...VALID_EXPENSE, occurredOn: '18/07/2026' });
    expect(r.ok).toBe(false);
  });

  it('rejects a label that is empty once trimmed', async () => {
    programMembership();
    const r = await createExpenseAction({ ...VALID_EXPENSE, label: '   ' });
    expect(r.ok).toBe(false);
  });
});

describe('createExpenseAction — what it actually writes', () => {
  it('persists paid_from instead of dropping it', async () => {
    // The regression this pins: the INSERT listed every field except
    // `paid_from`, so the column silently fell back to its DB default while
    // `updateExpenseAction` honoured it. Harmless until an account picker
    // exists — at which point the choice would vanish on create only.
    programMembership();
    supa.program({ table: 'expenses', op: 'insert', result: { data: null, error: null } });
    await createExpenseAction({ ...VALID_EXPENSE, paidFrom: 'epargne' });
    expect(supa.lastInsertPayload()).toMatchObject({ paid_from: 'epargne' });
  });

  it('falls back to vie_courante when the caller omits paid_from', async () => {
    programMembership();
    supa.program({ table: 'expenses', op: 'insert', result: { data: null, error: null } });
    await createExpenseAction(VALID_EXPENSE);
    expect(supa.lastInsertPayload()).toMatchObject({ paid_from: 'vie_courante' });
  });

  it('scopes the row to the caller workspace, never to a client-supplied one', async () => {
    programMembership();
    supa.program({ table: 'expenses', op: 'insert', result: { data: null, error: null } });
    await createExpenseAction({ ...VALID_EXPENSE, workspaceId: 'ws-attacker' });
    expect(supa.lastInsertPayload()).toMatchObject({ workspace_id: 'ws-1' });
  });

  it('emits the audit event on success', async () => {
    programMembership();
    supa.program({ table: 'expenses', op: 'insert', result: { data: null, error: null } });
    const r = await createExpenseAction(VALID_EXPENSE);
    expect(r).toEqual({ ok: true });
    expect(auditSpy).toHaveBeenCalled();
  });

  it('returns errors.expenses.createFailed on a DB error, with no audit event', async () => {
    programMembership();
    supa.program({
      table: 'expenses',
      op: 'insert',
      result: { data: null, error: { message: 'boom' } },
    });
    const r = await createExpenseAction(VALID_EXPENSE);
    expect(r).toEqual({ ok: false, errorCode: 'errors.expenses.createFailed' });
    expect(auditSpy).not.toHaveBeenCalled();
  });
});

describe('deleteExpenseAction — the only irreversible path', () => {
  it('rejects a malformed id before doing any authz work', async () => {
    const r = await deleteExpenseAction('not-a-uuid');
    expect(r).toEqual({ ok: false, errorCode: 'errors.validation.generic' });
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('returns errors.session.expired when no session', async () => {
    supa.authReturn({ data: { user: null } });
    const r = await deleteExpenseAction(EXPENSE_ID);
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.expired' });
  });

  it('returns errors.db.workspaceNotFound when no membership', async () => {
    supa.program({ table: 'workspace_members', op: 'select', result: { data: null, error: null } });
    const r = await deleteExpenseAction(EXPENSE_ID);
    expect(r).toEqual({ ok: false, errorCode: 'errors.db.workspaceNotFound' });
  });

  it('returns the rate-limit error', async () => {
    rateLimitSpy.mockImplementationOnce(async () => ({ success: false, limit: 60, remaining: 0 }));
    programMembership();
    const r = await deleteExpenseAction(EXPENSE_ID);
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.rateLimited' });
  });

  it('emits the audit event on success', async () => {
    programMembership();
    supa.program({ table: 'expenses', op: 'delete', result: { data: null, error: null } });
    const r = await deleteExpenseAction(EXPENSE_ID);
    expect(r).toEqual({ ok: true });
    expect(auditSpy).toHaveBeenCalled();
  });

  it('reports a DB failure without emitting an audit event', async () => {
    programMembership();
    supa.program({
      table: 'expenses',
      op: 'delete',
      result: { data: null, error: { message: 'boom' } },
    });
    const r = await deleteExpenseAction(EXPENSE_ID);
    expect(r.ok).toBe(false);
    expect(auditSpy).not.toHaveBeenCalled();
  });
});
