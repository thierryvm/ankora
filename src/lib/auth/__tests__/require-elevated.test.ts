import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The layer that protects the DATA.
 *
 * A page guard only protects what is displayed: a Server Action is a POST
 * endpoint reachable without ever rendering the page that calls it. Until
 * 2026-08-06 nothing in this codebase asked for the second factor at all, so a
 * session that skipped it kept full read and write access while the settings
 * screen showed « MFA activé · Actif ».
 *
 * The last case here is the only one that proves the data is covered. The others
 * pin the predicate's edges — including the one that would lock everybody out.
 */

const { getUserSpy, getSessionSpy, rateLimitSpy } = vi.hoisted(() => ({
  getUserSpy: vi.fn(),
  getSessionSpy: vi.fn(),
  rateLimitSpy: vi.fn(async () => ({ success: true, limit: 60, remaining: 59 })),
}));

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
  createClient: async () => ({
    auth: { getUser: getUserSpy, getSession: getSessionSpy },
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/security/rate-limit', () => ({ rateLimit: rateLimitSpy }));
vi.mock('@/lib/security/audit-log', () => ({ AuditEvent: {}, logAuditEvent: vi.fn() }));
vi.mock('@/lib/actions/revalidate', () => ({ revalidateAppPath: vi.fn() }));

const jeton = (aal: string): string =>
  `entete.${Buffer.from(JSON.stringify({ aal, sub: 'user-1' })).toString('base64url')}.signature`;

const AVEC_FACTEUR = { id: 'user-1', factors: [{ status: 'verified' }] };
const SANS_FACTEUR = { id: 'user-1', factors: [] };

function session(accessToken: string | null) {
  return { data: { session: accessToken ? { access_token: accessToken } : null } };
}

describe('elevationDue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * The anti-lockout case, and the one an earlier design got wrong: an account
   * with no verified factor can never reach aal2, so refusing it would put 2FA
   * permanently out of reach for everyone who has not enabled it.
   *
   * It also asserts the session is never even read — the common path costs
   * nothing.
   */
  it('ne réclame rien à un compte sans facteur, et ne lit même pas la session', async () => {
    const { elevationDue } = await import('../require-elevated');
    const supabase = { auth: { getSession: getSessionSpy } } as never;

    expect(await elevationDue(supabase, SANS_FACTEUR as never)).toBe(false);
    expect(getSessionSpy).not.toHaveBeenCalled();
  });

  it('réclame le second facteur sur une session restée en aal1', async () => {
    getSessionSpy.mockResolvedValue(session(jeton('aal1')));
    const { elevationDue } = await import('../require-elevated');
    const supabase = { auth: { getSession: getSessionSpy } } as never;

    expect(await elevationDue(supabase, AVEC_FACTEUR as never)).toBe(true);
  });

  it('laisse passer une session déjà élevée', async () => {
    getSessionSpy.mockResolvedValue(session(jeton('aal2')));
    const { elevationDue } = await import('../require-elevated');
    const supabase = { auth: { getSession: getSessionSpy } } as never;

    expect(await elevationDue(supabase, AVEC_FACTEUR as never)).toBe(false);
  });

  /**
   * Repli FERMÉ. Une panne du backend n'arrive jamais ici — elle est classée
   * `unavailable` en amont. Un échec à ce point signifie un jeton illisible,
   * donc des octets que le client tient.
   */
  it('réclame le second facteur quand la session est illisible', async () => {
    getSessionSpy.mockRejectedValue(new Error('cookie illisible'));
    const { elevationDue } = await import('../require-elevated');
    const supabase = { auth: { getSession: getSessionSpy } } as never;

    expect(await elevationDue(supabase, AVEC_FACTEUR as never)).toBe(true);
  });
});

describe('une Server Action mutante en aal1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitSpy.mockResolvedValue({ success: true, limit: 60, remaining: 59 });
  });

  /**
   * LA preuve que les données sont couvertes, et non seulement l'affichage.
   *
   * Sans la garde côté action, ce cas rendrait `errors.db.workspaceNotFound` ou
   * un succès — c'est-à-dire que l'écriture aurait été tentée. Le test échoue
   * donc bien en l'absence du correctif, et il échoue pour la bonne raison.
   */
  it('est refusée, et ne va pas jusqu à la base', async () => {
    getUserSpy.mockResolvedValue({ data: { user: AVEC_FACTEUR } });
    getSessionSpy.mockResolvedValue(session(jeton('aal1')));

    const { createChargeAction } = await import('@/lib/actions/charges');
    const res = await createChargeAction({
      label: 'Loyer',
      amount: 800,
      frequency: 'monthly',
      dueMonth: 1,
      paidFrom: 'principal',
    });

    expect(res).toEqual({ ok: false, errorCode: 'errors.auth.mfaRequired' });
  });

  /** Contrôle : le même appel passe la garde quand la session est élevée. */
  it('passe la garde quand la session est élevée', async () => {
    getUserSpy.mockResolvedValue({ data: { user: AVEC_FACTEUR } });
    getSessionSpy.mockResolvedValue(session(jeton('aal2')));

    const { createChargeAction } = await import('@/lib/actions/charges');
    const res = await createChargeAction({
      label: 'Loyer',
      amount: 800,
      frequency: 'monthly',
      dueMonth: 1,
      paidFrom: 'principal',
    });

    // La garde d'élévation est franchie : l'action va plus loin et bute sur
    // l'absence d'espace de travail dans ce harnais, pas sur le second facteur.
    expect(res).not.toEqual({ ok: false, errorCode: 'errors.auth.mfaRequired' });
  });
});
