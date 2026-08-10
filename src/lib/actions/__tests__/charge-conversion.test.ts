import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Le point aveugle que ce fichier ferme.
 *
 * `convertChargeToCommitmentAction` recopie DIX champs d'une charge vers
 * l'engagement qu'elle crée. Depuis J1 (ADR-038 D3) il y en a onze : `paid_from`.
 * Si cette ligne disparaît, l'insert omet simplement la colonne et le
 * `default 'principal'` de la migration s'applique — **sans erreur, sans
 * contrainte violée**. Une charge réglée depuis l'épargne devient un engagement
 * réglé depuis le compte principal, en silence, et à partir de D6 (J4) ce sont
 * deux soldes qui divergent en sens inverse pendant que le total reste juste.
 *
 * Relevé par `test-quality-auditor` le 2026-08-10 : ce fichier n'existait pas,
 * `convertChargeToCommitmentAction` n'était couverte NULLE PART (son seul autre
 * appelant, `ChargesClient.test.tsx`, mocke l'action entière), et aucun test
 * n'aurait échoué si la ligne avait été retirée. Un correctif sans test qui
 * échouerait sans lui n'est pas un correctif, c'est une hypothèse.
 */

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
      // `insert(...).select('id').single()` remet `currentOp` à 'select' : le
      // résultat terminal se programme donc sur (table, 'select'), pas
      // (table, 'insert'). Le payload, lui, est bien capturé ci-dessous.
      select: vi.fn(() => {
        currentOp = 'select';
        return builder;
      }),
      insert: vi.fn((payload: Record<string, unknown>) => {
        currentOp = 'insert';
        lastInsert = payload;
        return builder;
      }),
      update: vi.fn(() => {
        currentOp = 'update';
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
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
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
        client.auth.getUser.mockClear();
        client.from.mockClear();
      },
      lastInsertPayload: () => lastInsert,
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
  AuditEvent: { COMMITMENT_CREATED: 'commitment.created' },
  logAuditEvent: auditSpy,
}));
vi.mock('@/lib/security/rate-limit', () => ({ rateLimit: rateLimitSpy }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { convertChargeToCommitmentAction } from '../charge-conversion';

const CHARGE_ID = '5f2b4e1a-9c33-4d77-8a11-6e0d5b2c4a90';

/**
 * Une charge mensuelle échue le 15, donc dotée d'une prochaine échéance quel que
 * soit le jour où la suite tourne — `nextDueDateForCharge` lit l'horloge réelle.
 */
function chargeQuiSePaieDepuis(paidFrom: 'principal' | 'epargne') {
  return {
    id: CHARGE_ID,
    label: 'Assurance auto',
    amount: '280',
    frequency: 'monthly',
    payment_day: 15,
    payment_months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    category_id: null,
    is_active: true,
    paid_from: paidFrom,
  };
}

function programmeUneConversion(paidFrom: 'principal' | 'epargne') {
  supa.program({
    table: 'workspace_members',
    op: 'select',
    result: { data: { workspace_id: 'ws-1', role: 'owner' }, error: null },
  });
  supa.program({
    table: 'charges',
    op: 'select',
    result: { data: chargeQuiSePaieDepuis(paidFrom), error: null },
  });
  // `insert(...).select('id').single()` → le résultat terminal est un 'select'.
  supa.program({
    table: 'commitments',
    op: 'select',
    result: { data: { id: 'commitment-1' }, error: null },
  });
  supa.program({ table: 'charges', op: 'update', result: { data: null, error: null } });
}

beforeEach(() => {
  supa.reset();
  auditSpy.mockClear();
  rateLimitSpy.mockClear();
  rateLimitSpy.mockImplementation(async () => ({ success: true, limit: 60, remaining: 59 }));
});

describe('convertChargeToCommitmentAction — ADR-038 D3', () => {
  it("reporte « payé depuis l'épargne » sur l'engagement créé", async () => {
    programmeUneConversion('epargne');

    const r = await convertChargeToCommitmentAction({
      chargeId: CHARGE_ID,
      echeancesRestantes: 12,
    });

    expect(r.ok).toBe(true);
    // LA ligne. Sans elle, la colonne est omise, le défaut `principal` de la
    // migration s'applique, et rien ne proteste.
    expect(supa.lastInsertPayload()).toMatchObject({ paid_from: 'epargne' });
  });

  it('reporte aussi « principal », pour qu’une valeur codée en dur ne passe pas', async () => {
    programmeUneConversion('principal');

    const r = await convertChargeToCommitmentAction({
      chargeId: CHARGE_ID,
      echeancesRestantes: 12,
    });

    expect(r.ok).toBe(true);
    expect(supa.lastInsertPayload()).toMatchObject({ paid_from: 'principal' });
  });

  it('recopie bien le reste de la charge, pour que ce test protège le mapping entier', async () => {
    programmeUneConversion('epargne');

    await convertChargeToCommitmentAction({ chargeId: CHARGE_ID, echeancesRestantes: 12 });

    expect(supa.lastInsertPayload()).toMatchObject({
      workspace_id: 'ws-1',
      created_by: 'user-1',
      label: 'Assurance auto',
      kind: 'debt',
      installment_amount: 280,
      installments_total: 12,
      payment_day: 15,
      frequency: 'monthly',
      is_active: true,
    });
  });
});
