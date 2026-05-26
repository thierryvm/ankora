import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TerminalResult =
  | { data: unknown; error: null }
  | { data: null; error: { code?: string; message: string } };

type ScriptedQueue = {
  table: string;
  op: 'select' | 'update';
  result: TerminalResult;
};

const { supa, requireUserSpy, auditSpy, rateLimitSpy, revalidateSpy } = vi.hoisted(() => {
  const queue: ScriptedQueue[] = [];
  let lastUpdate: Record<string, unknown> | undefined;

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
      update: vi.fn((payload: Record<string, unknown>) => {
        currentOp = 'update';
        lastUpdate = payload;
        return builder;
      }),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => takeResult(table, currentOp)),
      then: (onFulfilled: (v: TerminalResult) => unknown) => {
        const result = takeResult(table, currentOp);
        return Promise.resolve(result).then(onFulfilled);
      },
    };
    return builder;
  }

  const client = {
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
        client.from.mockClear();
      },
      lastUpdatePayload: () => lastUpdate,
    },
    requireUserSpy: vi.fn(async () => ({
      user: { id: 'user-1', email: 'u@a.test' },
      workspaceId: 'ws-1',
      role: 'owner' as const,
    })),
    auditSpy: vi.fn(async () => {}),
    rateLimitSpy: vi.fn(async () => ({ success: true, limit: 60, remaining: 59 })),
    revalidateSpy: vi.fn(),
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

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => {
      if (name === 'x-forwarded-for') return '127.0.0.1';
      if (name === 'user-agent') return 'vitest';
      return null;
    },
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supa.client,
  createAdminClient: async () => supa.client,
}));

vi.mock('@/lib/auth/require-user', () => ({
  requireUserWithWorkspace: requireUserSpy,
}));

vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: {
    WORKSPACE_RESTE_A_VIVRE_UPDATED: 'workspace.reste_a_vivre_updated',
  },
  logAuditEvent: auditSpy,
}));

vi.mock('@/lib/security/rate-limit', () => ({
  rateLimit: rateLimitSpy,
}));

vi.mock('@/lib/actions/revalidate', () => ({
  revalidateDashboard: revalidateSpy,
}));

// Import AFTER mocks
import { updateResteAVivreOverrideAction } from '../reste-a-vivre';

const VALID_INPUT = {
  monthYYYYMM: '2026-05',
  montant: 450,
};

function resetAll() {
  supa.reset();
  requireUserSpy.mockClear();
  requireUserSpy.mockImplementation(async () => ({
    user: { id: 'user-1', email: 'u@a.test' } as unknown as Awaited<
      ReturnType<typeof requireUserSpy>
    >['user'],
    workspaceId: 'ws-1',
    role: 'owner' as const,
  }));
  auditSpy.mockClear();
  rateLimitSpy.mockClear();
  rateLimitSpy.mockImplementation(async () => ({ success: true, limit: 60, remaining: 59 }));
  revalidateSpy.mockClear();
}

describe('updateResteAVivreOverrideAction — rate limit', () => {
  beforeEach(resetAll);
  afterEach(() => vi.clearAllMocks());

  it('returns errors.session.rateLimited when rate-limit hit', async () => {
    rateLimitSpy.mockImplementationOnce(async () => ({ success: false, limit: 60, remaining: 0 }));
    const r = await updateResteAVivreOverrideAction(VALID_INPUT);
    expect(r).toEqual({ ok: false, errorCode: 'errors.session.rateLimited' });
    expect(auditSpy).not.toHaveBeenCalled();
    expect(revalidateSpy).not.toHaveBeenCalled();
  });
});

describe('updateResteAVivreOverrideAction — Zod validation', () => {
  beforeEach(resetAll);
  afterEach(() => vi.clearAllMocks());

  it('rejects malformed monthYYYYMM (single-digit month)', async () => {
    const r = await updateResteAVivreOverrideAction({ monthYYYYMM: '2026-5', montant: 450 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe('errors.validation.generic');
      expect(r.fieldErrors?.monthYYYYMM).toBeDefined();
    }
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('rejects month 13', async () => {
    const r = await updateResteAVivreOverrideAction({ monthYYYYMM: '2026-13', montant: 450 });
    expect(r.ok).toBe(false);
  });

  it('rejects negative montant', async () => {
    const r = await updateResteAVivreOverrideAction({ monthYYYYMM: '2026-05', montant: -10 });
    expect(r.ok).toBe(false);
  });

  it('rejects montant above 100 000', async () => {
    const r = await updateResteAVivreOverrideAction({ monthYYYYMM: '2026-05', montant: 100001 });
    expect(r.ok).toBe(false);
  });

  it('accepts montant = 0 (zero-budget month is legitimate)', async () => {
    supa.program({
      table: 'workspace_settings',
      op: 'select',
      result: { data: { reste_a_vivre_overrides: {} }, error: null },
    });
    supa.program({
      table: 'workspace_settings',
      op: 'update',
      result: { data: null, error: null },
    });
    const r = await updateResteAVivreOverrideAction({ monthYYYYMM: '2026-05', montant: 0 });
    expect(r).toEqual({ ok: true });
  });
});

describe('updateResteAVivreOverrideAction — happy path', () => {
  beforeEach(resetAll);
  afterEach(() => vi.clearAllMocks());

  it('merges into existing overrides without clobbering other months', async () => {
    supa.program({
      table: 'workspace_settings',
      op: 'select',
      result: {
        data: { reste_a_vivre_overrides: { '2026-04': 480, '2026-03': 520 } },
        error: null,
      },
    });
    supa.program({
      table: 'workspace_settings',
      op: 'update',
      result: { data: null, error: null },
    });

    const r = await updateResteAVivreOverrideAction(VALID_INPUT);
    expect(r).toEqual({ ok: true });
    expect(supa.lastUpdatePayload()).toEqual({
      reste_a_vivre_overrides: { '2026-04': 480, '2026-03': 520, '2026-05': 450 },
    });
  });

  it('handles the first override (overrides starts as empty object)', async () => {
    supa.program({
      table: 'workspace_settings',
      op: 'select',
      result: { data: { reste_a_vivre_overrides: {} }, error: null },
    });
    supa.program({
      table: 'workspace_settings',
      op: 'update',
      result: { data: null, error: null },
    });

    const r = await updateResteAVivreOverrideAction(VALID_INPUT);
    expect(r).toEqual({ ok: true });
    expect(supa.lastUpdatePayload()).toEqual({
      reste_a_vivre_overrides: { '2026-05': 450 },
    });
  });

  it('handles workspace_settings row missing (defensive)', async () => {
    supa.program({
      table: 'workspace_settings',
      op: 'select',
      result: { data: null, error: null },
    });
    supa.program({
      table: 'workspace_settings',
      op: 'update',
      result: { data: null, error: null },
    });

    const r = await updateResteAVivreOverrideAction(VALID_INPUT);
    expect(r).toEqual({ ok: true });
    expect(supa.lastUpdatePayload()).toEqual({
      reste_a_vivre_overrides: { '2026-05': 450 },
    });
  });

  it('calls logAuditEvent with WORKSPACE_RESTE_A_VIVRE_UPDATED + period_yyyymm (NO amount)', async () => {
    supa.program({
      table: 'workspace_settings',
      op: 'select',
      result: { data: { reste_a_vivre_overrides: {} }, error: null },
    });
    supa.program({
      table: 'workspace_settings',
      op: 'update',
      result: { data: null, error: null },
    });

    await updateResteAVivreOverrideAction(VALID_INPUT);
    expect(auditSpy).toHaveBeenCalledTimes(1);
    const call = (auditSpy.mock.calls as unknown as unknown[][])[0]!;
    expect(call[0]).toBe('workspace.reste_a_vivre_updated');
    expect(call[1]).toMatchObject({ userId: 'user-1', workspaceId: 'ws-1' });
    expect(call[2]).toEqual({ period_yyyymm: '2026-05' });
    // Defence-in-depth: the audit metadata must NEVER carry the amount —
    // amounts are PII-adjacent in financial software.
    expect(JSON.stringify(call[2])).not.toContain('450');
    expect(JSON.stringify(call[2])).not.toContain('montant');
  });

  it('revalidates the dashboard on success', async () => {
    supa.program({
      table: 'workspace_settings',
      op: 'select',
      result: { data: { reste_a_vivre_overrides: {} }, error: null },
    });
    supa.program({
      table: 'workspace_settings',
      op: 'update',
      result: { data: null, error: null },
    });

    await updateResteAVivreOverrideAction(VALID_INPUT);
    expect(revalidateSpy).toHaveBeenCalledTimes(1);
  });
});

describe('updateResteAVivreOverrideAction — DB failures', () => {
  beforeEach(resetAll);
  afterEach(() => vi.clearAllMocks());

  it('returns errors.settings.resteAVivreUpdateFailed on read error', async () => {
    supa.program({
      table: 'workspace_settings',
      op: 'select',
      result: { data: null, error: { code: 'PGRST500', message: 'boom' } },
    });
    const r = await updateResteAVivreOverrideAction(VALID_INPUT);
    expect(r).toEqual({ ok: false, errorCode: 'errors.settings.resteAVivreUpdateFailed' });
    expect(auditSpy).not.toHaveBeenCalled();
    expect(revalidateSpy).not.toHaveBeenCalled();
  });

  it('returns errors.settings.resteAVivreUpdateFailed on write error', async () => {
    supa.program({
      table: 'workspace_settings',
      op: 'select',
      result: { data: { reste_a_vivre_overrides: {} }, error: null },
    });
    supa.program({
      table: 'workspace_settings',
      op: 'update',
      result: { data: null, error: { code: 'PGRST500', message: 'boom' } },
    });
    const r = await updateResteAVivreOverrideAction(VALID_INPUT);
    expect(r).toEqual({ ok: false, errorCode: 'errors.settings.resteAVivreUpdateFailed' });
    expect(auditSpy).not.toHaveBeenCalled();
    expect(revalidateSpy).not.toHaveBeenCalled();
  });
});

// PR-BETA-3 hotfix 2026-05-26 — resilience under transient failures.
// These cases shipped silently as HTTP 503 before the hotfix; now they are
// caught and surface as a translated `{ ok: false }` response or — for
// non-critical post-write side effects — as a successful response with a
// server-side error log.
describe('updateResteAVivreOverrideAction — defensive failure modes (hotfix)', () => {
  beforeEach(resetAll);
  afterEach(() => vi.clearAllMocks());

  it('still returns ok: true when logAuditEvent throws after the write succeeds', async () => {
    supa.program({
      table: 'workspace_settings',
      op: 'select',
      result: { data: { reste_a_vivre_overrides: {} }, error: null },
    });
    supa.program({
      table: 'workspace_settings',
      op: 'update',
      result: { data: null, error: null },
    });
    // Audit log throws — must NOT undo the user write.
    auditSpy.mockImplementationOnce(async () => {
      throw new Error('audit_log insert blew up');
    });

    const r = await updateResteAVivreOverrideAction(VALID_INPUT);
    expect(r).toEqual({ ok: true });
    // Revalidation still fires — the write committed.
    expect(revalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('still returns ok: true when revalidateDashboard throws after the write succeeds', async () => {
    supa.program({
      table: 'workspace_settings',
      op: 'select',
      result: { data: { reste_a_vivre_overrides: {} }, error: null },
    });
    supa.program({
      table: 'workspace_settings',
      op: 'update',
      result: { data: null, error: null },
    });
    revalidateSpy.mockImplementationOnce(() => {
      throw new Error('next.js cache infra blip');
    });

    const r = await updateResteAVivreOverrideAction(VALID_INPUT);
    expect(r).toEqual({ ok: true });
  });

  it('returns a translated errorCode when an unexpected throw occurs inside the action body', async () => {
    // Make Supabase select throw outright (not return { error }) — emulates
    // a createClient init crash or a transient network exception. The outer
    // try/catch must convert this into `{ ok: false }`, never a bare 5xx.
    supa.client.from.mockImplementationOnce(() => {
      throw new Error('connect ECONNREFUSED');
    });

    const r = await updateResteAVivreOverrideAction(VALID_INPUT);
    expect(r).toEqual({ ok: false, errorCode: 'errors.settings.resteAVivreUpdateFailed' });
    expect(auditSpy).not.toHaveBeenCalled();
    expect(revalidateSpy).not.toHaveBeenCalled();
  });

  it('lets Next.js redirect() errors from requireUserWithWorkspace() propagate', async () => {
    // Simulate the `redirect('/login')` that next/navigation throws when
    // the session is gone — Next.js relies on the throw to bubble up to
    // its framework code. If our outer catch swallowed it, the user would
    // see a generic "update failed" toast instead of being bounced to
    // /login.
    const redirectMarker = Object.assign(new Error('NEXT_REDIRECT;replace;/login;307;'), {
      digest: 'NEXT_REDIRECT;replace;/login;307;',
    });
    requireUserSpy.mockRejectedValueOnce(redirectMarker);

    await expect(updateResteAVivreOverrideAction(VALID_INPUT)).rejects.toBe(redirectMarker);
  });
});
