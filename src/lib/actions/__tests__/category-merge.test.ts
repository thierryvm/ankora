import { beforeEach, describe, expect, it, vi } from 'vitest';

type Reponse =
  | { data: unknown; error: null; count?: number | null }
  | { data: null; error: { message: string }; count?: null };

type Appel = {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  payload?: unknown;
  filtres: Array<[string, string, unknown]>;
};

/**
 * Ordered mock, as in `categories.test.ts`: answers are served in the order the
 * code awaits its queries, and every query is recorded with its operation and
 * its filters — so a test can say « no write happened » and « every write was
 * scoped to the session's workspace ».
 */
const { supa, auditSpy, rateLimitSpy } = vi.hoisted(() => {
  let file: Reponse[] = [];
  let user: { id: string } | null = { id: 'user-1' };
  const appels: Appel[] = [];

  const prochaine = (): Reponse => {
    const r = file.shift();
    if (!r) throw new Error('mock supabase: no programmed answer left');
    return r;
  };

  const builder = (table: string): Record<string, unknown> => {
    const appel: Appel = { table, op: 'select', filtres: [] };
    appels.push(appel);
    const filtre =
      (nom: string) =>
      (col: string, val: unknown): unknown => {
        appel.filtres.push([nom, col, val]);
        return b;
      };
    const b: Record<string, unknown> = {
      select: vi.fn(() => b),
      insert: vi.fn((payload: unknown) => {
        appel.op = 'insert';
        appel.payload = payload;
        return b;
      }),
      update: vi.fn((payload: unknown) => {
        appel.op = 'update';
        appel.payload = payload;
        return b;
      }),
      delete: vi.fn(() => {
        appel.op = 'delete';
        return b;
      }),
      eq: vi.fn(filtre('eq')),
      in: vi.fn(filtre('in')),
      order: vi.fn(() => b),
      limit: vi.fn(() => b),
      range: vi.fn(() => b),
      single: vi.fn(async () => prochaine()),
      maybeSingle: vi.fn(async () => prochaine()),
      then: (onFulfilled: (v: Reponse) => unknown) =>
        Promise.resolve(prochaine()).then(onFulfilled),
    };
    return b;
  };

  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    from: vi.fn((table: string) => builder(table)),
  };

  return {
    supa: {
      get client() {
        return client;
      },
      programme: (...reponses: Reponse[]) => file.push(...reponses),
      sansSession: () => {
        user = null;
      },
      appels: () => [...appels],
      ecritures: () => appels.filter((a) => a.op !== 'select'),
      reset: () => {
        file = [];
        user = { id: 'user-1' };
        appels.length = 0;
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
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => supa.client }));
vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: {
    CATEGORY_CREATED: 'category.created',
    CATEGORY_MERGED: 'category.merged',
    CATEGORY_DELETED: 'category.deleted',
  },
  logAuditEvent: auditSpy,
}));
vi.mock('@/lib/security/rate-limit', () => ({ rateLimit: rateLimitSpy }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { deleteEmptyCategoriesAction, mergeCategoriesAction } from '../category-merge';

const INTER = '11111111-1111-4111-8111-111111111111';
const COLRUYT = '22222222-2222-4222-8222-222222222222';
const COURSES = '33333333-3333-4333-8333-333333333333';
const SANTE_FIXE = '44444444-4444-4444-8444-444444444444';
const AILLEURS = '55555555-5555-4555-8555-555555555555';

const MEMBERSHIP: Reponse = { data: { workspace_id: 'ws-1', role: 'owner' }, error: null };
const CATEGORIES: Reponse = {
  data: [
    { id: INTER, name: 'Intermarché', kind: 'variable', is_system: false },
    { id: COLRUYT, name: 'Colruyt', kind: 'variable', is_system: false },
    { id: COURSES, name: 'Courses', kind: 'variable', is_system: true },
    { id: SANTE_FIXE, name: 'Assurances', kind: 'fixed', is_system: false },
  ],
  error: null,
};
/** Fictional rows: 3 expenses in the two shops, one with the fallback word. */
const LIGNES: Reponse = {
  data: [
    { id: 'e1', label: 'Intermarché', category_id: INTER, amount: '100.10' },
    { id: 'e2', label: 'Dépense', category_id: INTER, amount: '49.07' },
    { id: 'e3', label: 'pain', category_id: COLRUYT, amount: '8.59' },
  ],
  error: null,
};
const ok = (data: unknown = null): Reponse => ({ data, error: null });
const echec: Reponse = { data: null, error: { message: 'boom' } };

const vers = (sourceIds: string[], confirmedExpenseCount: number, extra = {}) => ({
  sourceIds,
  target: { kind: 'existing', id: COURSES },
  confirmedExpenseCount,
  confirmedBillCount: 0,
  ...extra,
});

beforeEach(() => {
  supa.reset();
  auditSpy.mockClear();
  rateLimitSpy.mockClear();
});

describe('mergeCategoriesAction — refusals write nothing', () => {
  it('refuses without a session', async () => {
    supa.sansSession();
    const r = await mergeCategoriesAction(vers([INTER], 2));
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.expired' });
    expect(supa.ecritures()).toEqual([]);
  });

  it('refuses when rate-limited', async () => {
    supa.programme(MEMBERSHIP);
    rateLimitSpy.mockImplementationOnce(async () => ({ success: false, limit: 60, remaining: 0 }));
    const r = await mergeCategoriesAction(vers([INTER], 2));
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.rateLimited' });
    expect(supa.ecritures()).toEqual([]);
  });

  it.each([
    ['no source', vers([], 0)],
    ['a source that is not a uuid', vers(['cat-inter'], 0)],
    ['a negative count', vers([INTER], -1)],
    ['a new target without a name', vers([INTER], 2, { target: { kind: 'new', name: ' ' } })],
  ])('rejects %s (Zod)', async (_, input) => {
    supa.programme(MEMBERSHIP);
    const r = await mergeCategoriesAction(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe('errors.validation.generic');
    expect(supa.ecritures()).toEqual([]);
  });

  it('refuses a source outside the session workspace, even when the client names another workspace', async () => {
    supa.programme(MEMBERSHIP, CATEGORIES);
    const r = await mergeCategoriesAction(vers([INTER, AILLEURS], 2, { workspaceId: 'ws-2' }));
    expect(r).toEqual({ ok: false, errorCode: 'errors.categories.mergeInvalid' });
    expect(supa.ecritures()).toEqual([]);
    const lecture = supa.appels().find((a) => a.table === 'categories')!;
    expect(lecture.filtres).toContainEqual(['eq', 'workspace_id', 'ws-1']);
  });

  it('refuses a bill category as source, and a target that is also a source', async () => {
    supa.programme(MEMBERSHIP, CATEGORIES);
    expect(await mergeCategoriesAction(vers([SANTE_FIXE], 0))).toEqual({
      ok: false,
      errorCode: 'errors.categories.mergeInvalid',
    });
    supa.programme(MEMBERSHIP, CATEGORIES);
    expect(
      await mergeCategoriesAction(vers([INTER], 2, { target: { kind: 'existing', id: INTER } })),
    ).toEqual({ ok: false, errorCode: 'errors.categories.mergeInvalid' });
    expect(supa.ecritures()).toEqual([]);
  });

  it('refuses when the confirmed count no longer matches what the server counts', async () => {
    supa.programme(MEMBERSHIP, CATEGORIES, LIGNES, ok([]), ok([]));
    const r = await mergeCategoriesAction(vers([INTER, COLRUYT], 2));
    expect(r).toEqual({ ok: false, errorCode: 'errors.categories.mergeStale' });
    expect(supa.ecritures()).toEqual([]);
  });
});

describe('mergeCategoriesAction — the merge', () => {
  const FACTURES = ok([{ id: 'b1', category_id: INTER }]);
  const ENGAGEMENTS = ok([{ id: 'k1', category_id: COLRUYT }]);

  it('relabels the fallback rows, moves only the confirmed rows of each source, deletes nothing', async () => {
    supa.programme(
      MEMBERSHIP,
      CATEGORIES,
      LIGNES,
      FACTURES,
      ENGAGEMENTS,
      ok(), // relabel e2 -> Intermarché
      ok([{ id: 'e1' }, { id: 'e2' }]), // expenses of INTER
      ok([{ id: 'b1' }]), // charges of INTER
      ok([{ id: 'e3' }]), // expenses of COLRUYT
      ok([{ id: 'k1' }]), // commitments of COLRUYT
    );
    const r = await mergeCategoriesAction(
      vers([INTER, COLRUYT], 3, { confirmedBillCount: 2, workspaceId: 'ws-2' }),
    );
    expect(r).toEqual({
      ok: true,
      data: { targetId: COURSES, movedExpenses: 3, emptiedCategoryIds: [INTER, COLRUYT] },
    });

    const ecritures = supa.ecritures();
    expect(ecritures.some((e) => e.op === 'delete')).toBe(false);
    // Every write is scoped to the SESSION's workspace, never the client's.
    for (const e of ecritures) expect(e.filtres).toContainEqual(['eq', 'workspace_id', 'ws-1']);
    expect(ecritures[0]).toMatchObject({
      table: 'expenses',
      payload: { label: 'Intermarché' },
      filtres: expect.arrayContaining([['in', 'id', ['e2']]]),
    });
    for (const e of ecritures) expect(JSON.stringify(e.payload)).not.toMatch(/amount/);

    // Each move is held by its source AND by the ids that were confirmed:
    // without the category filter, one update would re-file the whole workspace.
    const moves = ecritures.slice(1);
    expect(moves.map((m) => [m.table, m.filtres.filter((f) => f[1] !== 'workspace_id')])).toEqual([
      [
        'expenses',
        [
          ['eq', 'category_id', INTER],
          ['in', 'id', ['e1', 'e2']],
        ],
      ],
      [
        'charges',
        [
          ['eq', 'category_id', INTER],
          ['in', 'id', ['b1']],
        ],
      ],
      [
        'expenses',
        [
          ['eq', 'category_id', COLRUYT],
          ['in', 'id', ['e3']],
        ],
      ],
      [
        'commitments',
        [
          ['eq', 'category_id', COLRUYT],
          ['in', 'id', ['k1']],
        ],
      ],
    ]);
    for (const m of moves) expect(m.payload).toEqual({ category_id: COURSES });

    // The dated trace: identifiers only, no name, no amount.
    expect(auditSpy).toHaveBeenCalledTimes(1);
    const [evt, ctx, meta] = auditSpy.mock.calls[0] as unknown as [
      string,
      unknown,
      Record<string, unknown>,
    ];
    expect(evt).toBe('category.merged');
    expect(ctx).toEqual({ userId: 'user-1', workspaceId: 'ws-1' });
    expect(meta).toEqual({
      resource_type: 'category',
      resource_id: COURSES,
      count: 3,
      moved: [
        { category_id: INTER, expense_ids: ['e1', 'e2'], charge_ids: ['b1'], commitment_ids: [] },
        { category_id: COLRUYT, expense_ids: ['e3'], charge_ids: [], commitment_ids: ['k1'] },
      ],
    });
    expect(JSON.stringify(meta)).not.toMatch(/Intermarch|Colruyt|100\.10/);
  });

  it('refuses when the bills that follow are not the ones shown', async () => {
    supa.programme(MEMBERSHIP, CATEGORIES, LIGNES, FACTURES, ENGAGEMENTS);
    const r = await mergeCategoriesAction(vers([INTER, COLRUYT], 3, { confirmedBillCount: 1 }));
    expect(r).toEqual({ ok: false, errorCode: 'errors.categories.mergeStale' });
    expect(supa.ecritures()).toEqual([]);
  });

  it('refuses a bill category as target', async () => {
    supa.programme(MEMBERSHIP, CATEGORIES);
    const r = await mergeCategoriesAction(
      vers([INTER], 2, { target: { kind: 'existing', id: SANTE_FIXE } }),
    );
    expect(r).toEqual({ ok: false, errorCode: 'errors.categories.mergeInvalid' });
    expect(supa.ecritures()).toEqual([]);
  });

  it('creates a new expense category as target, then files the rows into it', async () => {
    supa.programme(
      MEMBERSHIP,
      CATEGORIES,
      LIGNES,
      ok([]),
      ok([]),
      ok({ id: 'new-cat' }), // insert
      ok(), // relabel e2
      ok([{ id: 'e1' }, { id: 'e2' }]),
    );
    const r = await mergeCategoriesAction(
      vers([INTER], 2, { target: { kind: 'new', name: 'Alimentation', colorToken: 'emerald' } }),
    );
    expect(r).toEqual({
      ok: true,
      data: { targetId: 'new-cat', movedExpenses: 2, emptiedCategoryIds: [INTER] },
    });
    const [insert, , move] = supa.ecritures();
    expect(insert).toMatchObject({
      table: 'categories',
      op: 'insert',
      payload: {
        workspace_id: 'ws-1',
        created_by: 'user-1',
        name: 'Alimentation',
        kind: 'variable',
        is_system: false,
      },
    });
    expect(move!.payload).toEqual({ category_id: 'new-cat' });
  });

  it('refuses a new target whose name is already taken, before writing', async () => {
    supa.programme(MEMBERSHIP, CATEGORIES, LIGNES, ok([]), ok([]));
    const r = await mergeCategoriesAction(
      vers([INTER], 2, { target: { kind: 'new', name: 'courses', colorToken: 'emerald' } }),
    );
    expect(r).toEqual({ ok: false, errorCode: 'errors.categories.duplicate' });
    expect(supa.ecritures()).toEqual([]);
  });

  it('stops at the first failed write, deletes nothing, and still traces what moved', async () => {
    supa.programme(
      MEMBERSHIP,
      CATEGORIES,
      LIGNES,
      FACTURES,
      ENGAGEMENTS,
      ok(),
      ok([{ id: 'e1' }, { id: 'e2' }]),
      echec, // charges of INTER fail
    );
    const r = await mergeCategoriesAction(vers([INTER, COLRUYT], 3, { confirmedBillCount: 2 }));
    expect(r).toEqual({ ok: false, errorCode: 'errors.categories.mergePartial' });
    const ecritures = supa.ecritures();
    expect(ecritures).toHaveLength(3);
    expect(ecritures.some((e) => e.op === 'delete')).toBe(false);
    expect(auditSpy).toHaveBeenCalledTimes(1);
    const meta = (auditSpy.mock.calls[0] as unknown as [string, unknown, { moved: unknown }])[2];
    expect(meta.moved).toEqual([
      { category_id: INTER, expense_ids: ['e1', 'e2'], charge_ids: [], commitment_ids: [] },
    ]);
  });

  it('a failure after the new target was created answers mergePartial, not mergeFailed', async () => {
    supa.programme(MEMBERSHIP, CATEGORIES, LIGNES, ok([]), ok([]), ok({ id: 'new-cat' }), echec);
    const r = await mergeCategoriesAction(
      vers([INTER], 2, { target: { kind: 'new', name: 'Alimentation', colorToken: 'emerald' } }),
    );
    expect(r).toEqual({ ok: false, errorCode: 'errors.categories.mergePartial' });
    expect(auditSpy).toHaveBeenCalledWith(
      'category.merged',
      expect.anything(),
      expect.objectContaining({ resource_id: 'new-cat' }),
    );
  });
});

describe('deleteEmptyCategoriesAction', () => {
  const vide: Reponse = { data: null, error: null, count: 0 };
  const un: Reponse = { data: null, error: null, count: 1 };

  it('deletes only empty, non-system expense categories of the session workspace', async () => {
    supa.programme(MEMBERSHIP, CATEGORIES, vide, vide, vide, ok([{ id: INTER }]));
    const r = await deleteEmptyCategoriesAction({ ids: [INTER], workspaceId: 'ws-2' });
    expect(r).toEqual({ ok: true, data: { deleted: 1 } });
    const del = supa.ecritures();
    expect(del).toHaveLength(1);
    expect(del[0]).toMatchObject({ table: 'categories', op: 'delete' });
    expect(del[0]!.filtres).toContainEqual(['eq', 'workspace_id', 'ws-1']);
    expect(del[0]!.filtres).toContainEqual(['in', 'id', [INTER]]);
  });

  it('refuses a category still used, a system one, or one from elsewhere', async () => {
    // The first non-empty count refuses at once: nothing further is read.
    supa.programme(MEMBERSHIP, CATEGORIES, un);
    expect(await deleteEmptyCategoriesAction({ ids: [INTER] })).toEqual({
      ok: false,
      errorCode: 'errors.categories.notEmpty',
    });
    supa.programme(MEMBERSHIP, CATEGORIES);
    expect(await deleteEmptyCategoriesAction({ ids: [COURSES] })).toEqual({
      ok: false,
      errorCode: 'errors.categories.mergeInvalid',
    });
    supa.programme(MEMBERSHIP, CATEGORIES);
    expect(await deleteEmptyCategoriesAction({ ids: [SANTE_FIXE] })).toEqual({
      ok: false,
      errorCode: 'errors.categories.mergeInvalid',
    });
    supa.programme(MEMBERSHIP, CATEGORIES);
    expect(await deleteEmptyCategoriesAction({ ids: [AILLEURS] })).toEqual({
      ok: false,
      errorCode: 'errors.categories.mergeInvalid',
    });
    expect(supa.ecritures()).toEqual([]);
  });
});
