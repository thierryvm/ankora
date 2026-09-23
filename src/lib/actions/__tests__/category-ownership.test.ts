import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Every Server Action that writes a client-supplied `category_id` must check,
 * BEFORE writing, that the category belongs to the session's workspace and is
 * of a kind that write may use.
 *
 * Unlike the per-action suites, this double does not script answers: it holds
 * a small `categories` table spanning TWO workspaces — as row-level security
 * would let a member of both see it — and honours every `.eq()` filter. A check
 * that forgot the workspace filter would therefore find the other workspace's
 * row and accept it, and these tests would go red.
 */

const CAT_A_VARIABLE = 'a1a1a1a1-1111-4111-8111-111111111111';
const CAT_A_FIXED = 'a2a2a2a2-2222-4222-8222-222222222222';
const CAT_A_INCOME = 'a3a3a3a3-3333-4333-8333-333333333333';
const CAT_B_VARIABLE = 'b1b1b1b1-1111-4111-8111-111111111111';
const CAT_NOWHERE = 'c0c0c0c0-0000-4000-8000-000000000000';
const ROW_ID = '10dccda9-7e0f-4b4e-9c7d-23f3c1b7e8a9';

type Row = Record<string, unknown>;
type Write = { table: string; op: 'insert' | 'update'; payload: Row };

const { db, auditSpy } = vi.hoisted(() => {
  const visible: Record<string, Row[]> = {
    workspace_members: [{ user_id: 'user-1', workspace_id: 'ws-a', role: 'owner' }],
    categories: [
      { id: 'a1a1a1a1-1111-4111-8111-111111111111', workspace_id: 'ws-a', kind: 'variable' },
      { id: 'a2a2a2a2-2222-4222-8222-222222222222', workspace_id: 'ws-a', kind: 'fixed' },
      { id: 'a3a3a3a3-3333-4333-8333-333333333333', workspace_id: 'ws-a', kind: 'income' },
      { id: 'b1b1b1b1-1111-4111-8111-111111111111', workspace_id: 'ws-b', kind: 'variable' },
    ],
  };
  const writes: Write[] = [];
  const reads: string[] = [];
  let failRead = false;

  function builder(table: string) {
    const filters: Array<[string, unknown]> = [];
    let op: 'select' | 'insert' | 'update' = 'select';
    const matching = () =>
      (visible[table] ?? []).filter((row) => filters.every(([k, v]) => row[k] === v));
    const b: Record<string, unknown> = {
      select: vi.fn(() => {
        if (op === 'select') reads.push(table);
        return b;
      }),
      insert: vi.fn((payload: Row) => {
        op = 'insert';
        writes.push({ table, op, payload });
        return b;
      }),
      update: vi.fn((payload: Row) => {
        op = 'update';
        writes.push({ table, op, payload });
        return b;
      }),
      eq: vi.fn((key: string, value: unknown) => {
        filters.push([key, value]);
        return b;
      }),
      in: vi.fn(() => b),
      order: vi.fn(() => b),
      limit: vi.fn(() => b),
      maybeSingle: vi.fn(async () =>
        table === 'categories' && failRead
          ? { data: null, error: { message: 'read failed' } }
          : { data: matching()[0] ?? null, error: null },
      ),
      then: (onFulfilled: (v: { data: null; error: null }) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(onFulfilled),
    };
    return b;
  }

  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn((table: string) => builder(table)),
  };

  return {
    db: {
      client,
      writes,
      reads,
      failCategoryRead: () => {
        failRead = true;
      },
      reset: () => {
        writes.length = 0;
        reads.length = 0;
        failRead = false;
      },
    },
    auditSpy: vi.fn(async () => {}),
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
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => db.client }));
vi.mock('@/lib/auth/require-elevated', () => ({
  MFA_REQUISE: 'errors.auth.mfaRequired',
  elevationDue: vi.fn(async () => false),
}));
vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: new Proxy({}, { get: (_target, prop) => String(prop) }),
  logAuditEvent: auditSpy,
}));
vi.mock('@/lib/security/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ success: true, limit: 60, remaining: 59 })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { createChargeAction, updateChargeAction } from '../charges';
import { createCommitmentAction, updateCommitmentAction } from '../commitments';
import { createExpenseAction, updateExpenseAction } from '../expenses';

type Case = {
  name: string;
  table: string;
  op: 'insert' | 'update';
  /** Categories of workspace A whose kind this write may NOT use. */
  wrongKinds: readonly string[];
  /** Categories of workspace A this write MAY use. */
  allowed: readonly string[];
  write: (categoryId: string | null) => Promise<{ ok: boolean; errorCode?: string }>;
};

const CASES: readonly Case[] = [
  {
    name: 'createExpenseAction',
    table: 'expenses',
    op: 'insert',
    wrongKinds: [CAT_A_FIXED, CAT_A_INCOME],
    allowed: [CAT_A_VARIABLE],
    write: (categoryId) =>
      createExpenseAction({
        label: 'Courses',
        amount: 42.5,
        occurredOn: '2026-09-10',
        categoryId,
        note: null,
      }),
  },
  {
    name: 'updateExpenseAction',
    table: 'expenses',
    op: 'update',
    wrongKinds: [CAT_A_FIXED, CAT_A_INCOME],
    allowed: [CAT_A_VARIABLE],
    write: (categoryId) => updateExpenseAction(ROW_ID, { categoryId }),
  },
  {
    name: 'createChargeAction',
    table: 'charges',
    op: 'insert',
    wrongKinds: [CAT_A_INCOME],
    allowed: [CAT_A_FIXED, CAT_A_VARIABLE],
    write: (categoryId) =>
      createChargeAction({
        label: 'Loyer',
        amount: 505,
        frequency: 'monthly',
        dueMonth: 1,
        categoryId,
        isActive: true,
      }),
  },
  {
    name: 'updateChargeAction',
    table: 'charges',
    op: 'update',
    wrongKinds: [CAT_A_INCOME],
    allowed: [CAT_A_FIXED, CAT_A_VARIABLE],
    write: (categoryId) => updateChargeAction(ROW_ID, { categoryId }),
  },
  {
    name: 'createCommitmentAction',
    table: 'commitments',
    op: 'insert',
    wrongKinds: [CAT_A_INCOME],
    allowed: [CAT_A_FIXED, CAT_A_VARIABLE],
    write: (categoryId) =>
      createCommitmentAction({
        label: 'Crédit voiture',
        kind: 'debt',
        totalAmount: 705,
        installmentAmount: 235,
        installmentsTotal: 3,
        startYear: 2026,
        startMonth: 8,
        categoryId,
      }),
  },
  {
    name: 'updateCommitmentAction',
    table: 'commitments',
    op: 'update',
    wrongKinds: [CAT_A_INCOME],
    allowed: [CAT_A_FIXED, CAT_A_VARIABLE],
    write: (categoryId) => updateCommitmentAction(ROW_ID, { categoryId }),
  },
];

const REFUSED = { ok: false, errorCode: 'errors.validation.generic' };

beforeEach(() => {
  db.reset();
  auditSpy.mockClear();
});

describe.each(CASES)('$name — category ownership', (c) => {
  it("refuses another workspace's category, even of the right kind, and writes nothing", async () => {
    const r = await c.write(CAT_B_VARIABLE);
    expect(r).toEqual(REFUSED);
    expect(db.writes.filter((w) => w.table === c.table)).toEqual([]);
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('answers a category that exists nowhere exactly like a foreign one', async () => {
    const foreign = await c.write(CAT_B_VARIABLE);
    const nowhere = await c.write(CAT_NOWHERE);
    expect(nowhere).toEqual(foreign);
    expect(db.writes).toEqual([]);
  });

  it('refuses a category of its own workspace of the wrong kind, and writes nothing', async () => {
    for (const categoryId of c.wrongKinds) {
      const r = await c.write(categoryId);
      expect(r).toEqual(REFUSED);
      expect(db.writes.filter((w) => w.table === c.table)).toEqual([]);
    }
  });

  it('accepts its own category of an allowed kind and writes it', async () => {
    for (const categoryId of c.allowed) {
      db.reset();
      const r = await c.write(categoryId);
      expect(r).toEqual({ ok: true });
      const written = db.writes.filter((w) => w.table === c.table && w.op === c.op);
      expect(written).toHaveLength(1);
      expect(written[0]!.payload).toMatchObject({ category_id: categoryId });
    }
  });
});

describe.each(CASES)('$name — a failed category read', (c) => {
  it('refuses (fail closed) and writes nothing', async () => {
    db.failCategoryRead();
    const r = await c.write(c.allowed[0]!);
    expect(r).toEqual(REFUSED);
    expect(db.writes.filter((w) => w.table === c.table)).toEqual([]);
  });
});

describe('a write without a category is not blocked by the check', () => {
  it('createChargeAction with categoryId null writes, without reading categories', async () => {
    const r = await createChargeAction({
      label: 'Loyer',
      amount: 505,
      frequency: 'monthly',
      dueMonth: 1,
      categoryId: null,
      isActive: true,
    });
    expect(r).toEqual({ ok: true });
    expect(db.reads).not.toContain('categories');
    expect(db.writes.filter((w) => w.table === 'charges')).toHaveLength(1);
  });

  it('updateExpenseAction that leaves the category alone does not read categories', async () => {
    const r = await updateExpenseAction(ROW_ID, { label: 'Courses du samedi' });
    expect(r).toEqual({ ok: true });
    expect(db.reads).not.toContain('categories');
    expect(db.writes.filter((w) => w.table === 'expenses')).toHaveLength(1);
  });
});
