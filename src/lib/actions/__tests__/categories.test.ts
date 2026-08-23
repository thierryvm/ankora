import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Reponse = { data: unknown; error: null } | { data: null; error: { message: string } };

/**
 * Mock Supabase dédié plutôt que celui d'`expenses.test.ts`.
 *
 * Celui-là indexe ses résultats par `(table, opération)`, et l'opération est
 * écrasée par le dernier appel de la chaîne. Or l'insertion ici est
 * `.insert().select().single()` : elle serait enregistrée comme un `select` et
 * consommerait le résultat prévu pour la LECTURE des doublons. Un mock qui rend
 * la mauvaise réponse fait échouer un test sur un défaut qui n'existe pas —
 * c'est un faux positif d'instrument, et il coûte plus cher qu'un test absent.
 *
 * Ici, les réponses sont servies dans l'ordre d'appel de `.from()`, ce qui est
 * exactement l'ordre du code : membership → lecture des catégories → insertion.
 */
const { supa, auditSpy, rateLimitSpy } = vi.hoisted(() => {
  let file: Reponse[] = [];
  let user: { id: string } | null = { id: 'user-1' };
  let dernierInsert: Record<string, unknown> | undefined;
  const tablesVues: string[] = [];

  const prochaine = (): Reponse => {
    const r = file.shift();
    if (!r) throw new Error('mock supabase : plus de reponse programmee');
    return r;
  };

  const builder = (table: string): Record<string, unknown> => {
    tablesVues.push(table);
    const b: Record<string, unknown> = {
      select: vi.fn(() => b),
      insert: vi.fn((payload: Record<string, unknown>) => {
        dernierInsert = payload;
        return b;
      }),
      eq: vi.fn(() => b),
      in: vi.fn(() => b),
      order: vi.fn(() => b),
      limit: vi.fn(() => b),
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
      dernierInsert: () => dernierInsert,
      tablesVues: () => [...tablesVues],
      reset: () => {
        file = [];
        user = { id: 'user-1' };
        dernierInsert = undefined;
        tablesVues.length = 0;
        client.auth.getUser.mockClear();
        client.from.mockClear();
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
  AuditEvent: { CATEGORY_CREATED: 'category.created' },
  logAuditEvent: auditSpy,
}));
vi.mock('@/lib/security/rate-limit', () => ({ rateLimit: rateLimitSpy }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { createExpenseCategoryAction } from '../categories';

const MEMBERSHIP: Reponse = {
  data: { workspace_id: 'ws-1', role: 'owner' },
  error: null,
};

const EXISTANTES: Reponse = {
  data: [
    { id: 'c1', name: 'Courses', kind: 'variable' },
    { id: 'c2', name: 'Assurances', kind: 'fixed' },
  ],
  error: null,
};

const CREEE: Reponse = {
  data: { id: 'c3', name: 'Coiffeur', color_token: 'rose' },
  error: null,
};

beforeEach(() => {
  supa.reset();
  auditSpy.mockClear();
  rateLimitSpy.mockClear();
  rateLimitSpy.mockImplementation(async () => ({ success: true, limit: 60, remaining: 59 }));
});

afterEach(() => vi.restoreAllMocks());

describe('createExpenseCategoryAction — les refus', () => {
  it('refuse sans session, et n’écrit rien au journal', async () => {
    supa.sansSession();
    const r = await createExpenseCategoryAction({ name: 'Coiffeur', colorToken: 'rose' });
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.expired' });
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('refuse quand la limite de débit est atteinte', async () => {
    supa.programme(MEMBERSHIP);
    rateLimitSpy.mockImplementationOnce(async () => ({ success: false, limit: 60, remaining: 0 }));
    const r = await createExpenseCategoryAction({ name: 'Coiffeur', colorToken: 'rose' });
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.rateLimited' });
  });

  it('refuse un nom vide', async () => {
    supa.programme(MEMBERSHIP);
    const r = await createExpenseCategoryAction({ name: '   ', colorToken: 'rose' });
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ errorCode: 'errors.validation.generic' });
  });

  it('refuse un nom de 41 caractères', async () => {
    supa.programme(MEMBERSHIP);
    const r = await createExpenseCategoryAction({ name: 'x'.repeat(41), colorToken: 'rose' });
    expect(r).toMatchObject({ ok: false, errorCode: 'errors.validation.generic' });
  });

  it('refuse un nom fait uniquement de caractères invisibles', async () => {
    // Le nettoyage a lieu AVANT la validation : il reste une chaîne vide, que
    // `min(1)` refuse. Sans le nettoyage, cette catégorie serait créée avec un
    // nom qui ne s'affiche pas.
    supa.programme(MEMBERSHIP);
    const r = await createExpenseCategoryAction({ name: '​​', colorToken: 'rose' });
    expect(r).toMatchObject({ ok: false, errorCode: 'errors.validation.generic' });
  });

  it('refuse un jeton de couleur inventé', async () => {
    supa.programme(MEMBERSHIP);
    const r = await createExpenseCategoryAction({ name: 'Coiffeur', colorToken: 'fuchsia' });
    expect(r).toMatchObject({ ok: false, errorCode: 'errors.validation.generic' });
  });

  it('refuse un homonyme, insensible à la casse', async () => {
    supa.programme(MEMBERSHIP, EXISTANTES);
    const r = await createExpenseCategoryAction({ name: '  courses ', colorToken: 'rose' });
    expect(r).toEqual({ ok: false, errorCode: 'errors.categories.duplicate' });
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('distingue l’homonyme de FACTURE, qui n’est pas visible dans le sélecteur', async () => {
    // Sans ce code distinct, l'utilisateur lirait « existe déjà » à propos d'une
    // catégorie que l'écran ne lui montre jamais (ADR-035 §5).
    supa.programme(MEMBERSHIP, EXISTANTES);
    const r = await createExpenseCategoryAction({ name: 'assurances', colorToken: 'rose' });
    expect(r).toEqual({ ok: false, errorCode: 'errors.categories.duplicateBill' });
  });

  it('refuse quand la LECTURE des catégories échoue, au lieu de créer à l’aveugle', async () => {
    // Le repli silencieux serait de traiter l'échec comme « aucune catégorie »,
    // donc « aucun doublon possible ». Le contrôle deviendrait un no-op au
    // moment précis où il compte.
    supa.programme(MEMBERSHIP, { data: null, error: { message: 'boom' } });
    const r = await createExpenseCategoryAction({ name: 'Coiffeur', colorToken: 'rose' });
    expect(r).toEqual({ ok: false, errorCode: 'errors.categories.createFailed' });
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('refuse quand l’insertion échoue', async () => {
    supa.programme(MEMBERSHIP, EXISTANTES, { data: null, error: { message: 'boom' } });
    const r = await createExpenseCategoryAction({ name: 'Coiffeur', colorToken: 'rose' });
    expect(r).toEqual({ ok: false, errorCode: 'errors.categories.createFailed' });
    expect(auditSpy).not.toHaveBeenCalled();
  });
});

describe('createExpenseCategoryAction — la création', () => {
  it('écrit exactement ce qu’ADR-043 décide', async () => {
    supa.programme(MEMBERSHIP, EXISTANTES, CREEE);
    const r = await createExpenseCategoryAction({ name: '  Coiffeur ', colorToken: 'rose' });

    expect(r).toEqual({
      ok: true,
      data: { id: 'c3', name: 'Coiffeur', colorToken: 'rose' },
    });

    const insert = supa.dernierInsert();
    expect(insert).toMatchObject({
      workspace_id: 'ws-1',
      // Exigé par `WITH CHECK` de `categories_editor_write` : sans lui, la RLS
      // refuse la ligne.
      created_by: 'user-1',
      name: 'Coiffeur',
      color_token: 'rose',
      kind: 'variable',
      is_system: false,
    });
    // ADR-043 D3 : le groupe reste NULL, il n'est pas deviné.
    expect(insert).not.toHaveProperty('category_group');
  });

  it('normalise le nom AVANT de l’écrire', async () => {
    supa.programme(MEMBERSHIP, EXISTANTES, CREEE);
    await createExpenseCategoryAction({
      // NFD (« e » + accent combinant), double espace, et une espace de largeur
      // nulle. Rien de tout cela ne doit atteindre la base.
      name: 'Café  du​ coin',
      colorToken: 'rose',
    });
    expect(supa.dernierInsert()?.name).toBe('Café du coin');
  });

  it('journalise avec les métadonnées en TROISIÈME argument et la clé snake_case', async () => {
    // Deux pièges qui se composent en un journal vide avec un test vert :
    // `AuditContext` ne porte pas `resourceId`, et `sanitizeMetadata` jette
    // sans un mot toute clé absente de sa liste blanche.
    supa.programme(MEMBERSHIP, EXISTANTES, CREEE);
    await createExpenseCategoryAction({ name: 'Coiffeur', colorToken: 'rose' });

    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy).toHaveBeenCalledWith(
      'category.created',
      { userId: 'user-1', workspaceId: 'ws-1' },
      { resource_id: 'c3', resource_type: 'category' },
    );
  });

  it('ne met JAMAIS le nom dans le journal', async () => {
    // Un nom de catégorie est une saisie libre, donc une donnée de
    // l'utilisateur. La liste blanche le jetterait — raison de plus pour ne pas
    // l'écrire, plutôt que de compter sur elle.
    supa.programme(MEMBERSHIP, EXISTANTES, CREEE);
    await createExpenseCategoryAction({ name: 'Coiffeur', colorToken: 'rose' });
    expect(JSON.stringify(auditSpy.mock.calls[0])).not.toContain('Coiffeur');
  });
});
