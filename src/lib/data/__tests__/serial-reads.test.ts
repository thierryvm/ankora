/**
 * How many network round-trips a /app render waits for, one after the other.
 *
 * Every Supabase call made through the fake client below stays PENDING until
 * the driver releases the whole batch. A batch is one "wave": the calls a
 * render can issue without waiting for any other answer. Counting waves counts
 * the serial round-trips, which is what production pays for — each one is a
 * trip from the Vercel function to Supabase.
 *
 * `React.cache` is SIMULATED here. Outside a server render (vitest), React's
 * `cache` memoizes nothing, so the mock below stands in for its documented
 * contract: one memo per request, nothing shared between requests. Each test
 * is one request (`requestMemo` is cleared in `beforeEach`). The real proof
 * that production deduplicates is the Kong access-log count on a production
 * build, recorded in the PR — not this file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requestMemo: new Map<unknown, unknown>(),
  // false = outside a render (a Server Action): React's cache memoizes nothing.
  memoize: true,
  logInfo: vi.fn(),
  pending: [] as Array<() => void>,
  issued: [] as string[],
  // Never drained by `drive`: every call of the request, for "never issued" checks.
  everIssued: [] as string[],
  getUserCalls: 0,
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  user: { id: 'user-fictif', email: 'famille@ankora.test' } as unknown,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache:
      <A extends unknown[], R>(fn: (...args: A) => R) =>
      (...args: A): R => {
        if (!h.memoize) return fn(...args);
        if (args.length > 0) throw new Error('test memo only supports zero-arg functions');
        if (!h.requestMemo.has(fn)) h.requestMemo.set(fn, fn(...args));
        return h.requestMemo.get(fn) as R;
      },
  };
});

function pendingCall<T>(name: string, value: T): Promise<T> {
  h.issued.push(name);
  h.everIssued.push(name);
  return new Promise<T>((resolve) => h.pending.push(() => resolve(value)));
}

function queryBuilder(table: string) {
  const result = h.tables[table] ?? { data: [], error: null };
  let started: Promise<unknown> | null = null;
  const builder: Record<string, unknown> = {};
  for (const method of [
    'select',
    'eq',
    'gte',
    'lt',
    'lte',
    'order',
    'limit',
    'in',
    'is',
    'range',
  ]) {
    builder[method] = () => builder;
  }
  builder.single = () => builder;
  builder.maybeSingle = () => builder;
  builder.then = (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) => {
    started ??= pendingCall(table, result);
    return started.then(onFulfilled, onRejected);
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: () => {
        h.getUserCalls += 1;
        return pendingCall('auth.getUser', { data: { user: h.user }, error: null });
      },
      getSession: async () => ({ data: { session: null } }),
    },
    from: (table: string) => queryBuilder(table),
  }),
}));

vi.mock('@/lib/env', () => ({ env: {} }));
vi.mock('@/lib/log', () => ({
  log: { info: h.logInfo, error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'fr-BE',
  // The snapshot names seeded accounts by their translated default (H1).
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/i18n/navigation', () => ({
  redirect: ({ href }: { href: string }) => {
    throw new Error(`REDIRECT ${href}`);
  },
}));

import { getOptionalUser, requireUser } from '@/lib/auth/require-user';
import { isAdmin } from '@/lib/auth/is-admin';
import { avecLectureAnticipee, readDepensesDebut } from '@/lib/data/debut-des-donnees';
import { loadMonthSituation } from '@/lib/data/month-situation';
import * as snapshotModule from '@/lib/data/workspace-snapshot';

const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Releases the pending calls wave by wave and returns what each wave issued. */
async function drive<T>(work: Promise<T>): Promise<{ waves: string[][]; result: T }> {
  let settled = false;
  let value: T | undefined;
  let failure: unknown;
  let failed = false;
  work.then(
    (v) => {
      settled = true;
      value = v;
    },
    (e) => {
      settled = true;
      failed = true;
      failure = e;
    },
  );
  const waves: string[][] = [];
  for (let guard = 0; guard < 50; guard++) {
    for (let i = 0; i < 10; i++) await tick();
    if (h.pending.length === 0) break;
    waves.push(h.issued.splice(0));
    h.pending.splice(0).forEach((release) => release());
  }
  for (let i = 0; i < 10; i++) await tick();
  if (!settled) throw new Error('render never settled');
  if (failed) throw failure;
  return { waves, result: value as T };
}

const waveOf = (waves: string[][], name: string) =>
  waves.findIndex((wave) => wave.includes(name)) + 1;

beforeEach(() => {
  h.requestMemo.clear();
  h.memoize = true;
  h.logInfo.mockReset();
  h.pending.length = 0;
  h.issued.length = 0;
  h.everIssued.length = 0;
  h.user = { id: 'user-fictif', email: 'famille@ankora.test' };
  h.getUserCalls = 0;
  h.tables = {
    users: { data: { onboarded_at: '2026-01-01T00:00:00Z' }, error: null },
    workspace_members: { data: { workspace_id: 'ws-fictif' }, error: null },
    workspaces: {
      data: {
        id: 'ws-fictif',
        name: 'Famille',
        monthly_income: 705,
        vie_courante_monthly_transfer: 505,
      },
      error: null,
    },
    workspace_settings: { data: null, error: null },
  };
});

describe('/app render — session lookups', () => {
  it('checks the session once for the layout AND the page snapshot of one request', async () => {
    await drive(Promise.all([requireUser(), snapshotModule.getWorkspaceSnapshot()]));
    expect(h.getUserCalls).toBe(1);
  });
});

describe('locale layout — the admin entry shares the session lookup', () => {
  it('asks the auth server once for getOptionalUser AND isAdmin in one request', async () => {
    // The layout awaits them one after the other; the second must be a memo hit.
    await drive(
      (async () => {
        const signedIn = (await getOptionalUser()) !== null;
        return signedIn && (await isAdmin());
      })(),
    );
    expect(h.getUserCalls).toBe(1);
  });
});

/** Every call the render issued, across all waves. */
const countIssued = (waves: string[][], name: string) =>
  waves.flat().filter((issued) => issued === name).length;

describe('/app render — the G-31 read leaves with the snapshot (lot P2)', () => {
  // These go through `avecLectureAnticipee`, the page's own scheduling: if it
  // ever awaited the situation before sending the G-31 read, that read would
  // form one wave MORE than counted here.
  it('the scheduling helper: wave 3, one resolution, three waves in all', async () => {
    const { waves, result } = await drive(
      avecLectureAnticipee('2026-09-12', () =>
        snapshotModule.getSnapshotWith(null, (workspaceId) =>
          pendingCall('page-read', workspaceId),
        ),
      ).then(async ({ lectureAnticipee }) => lectureAnticipee()),
    );
    expect(waves).toHaveLength(3);
    // Every `expenses` read — the snapshot's month and the G-31 one — is in wave 3.
    expect(waves[2]).toContain('expenses');
    expect(countIssued(waves.slice(0, 2), 'expenses')).toBe(0);
    expect(waveOf(waves, 'page-read')).toBe(3);
    // One resolution of the workspace for both readers.
    expect(h.getUserCalls).toBe(1);
    expect(countIssued(waves, 'users')).toBe(1);
    expect(countIssued(waves, 'workspace_members')).toBe(1);
    expect(result).toEqual({ ok: true, dates: [] });
  });

  it('the scheduling helper: a gate redirect surfaces through the situation, no unhandled rejection', async () => {
    h.tables.users = { data: { onboarded_at: null }, error: null };
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      await expect(
        drive(avecLectureAnticipee('2026-09-12', () => snapshotModule.getWorkspaceSnapshot())),
      ).rejects.toThrow('REDIRECT /onboarding');
      for (let i = 0; i < 10; i++) await tick();
      expect(unhandled).not.toHaveBeenCalled();
      expect(h.everIssued).not.toContain('expenses');
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('a redirect from the workspace gate rejects the early read, which never runs', async () => {
    h.tables.users = { data: { onboarded_at: null }, error: null };
    const early = snapshotModule
      .currentWorkspaceId()
      .then((workspaceId) => readDepensesDebut(workspaceId, '2026-09-12'));
    await expect(drive(early)).rejects.toThrow('REDIRECT /onboarding');
    expect(h.everIssued).toContain('users');
    expect(h.everIssued).not.toContain('expenses');
  });

  it('a session owing its second factor is redirected before the early read leaves', async () => {
    // A verified factor and no readable session token: `elevationDue` fails
    // closed, so the gate redirects to the challenge.
    h.user = {
      id: 'user-fictif',
      email: 'famille@ankora.test',
      factors: [{ id: 'f-1', status: 'verified', factor_type: 'totp' }],
    };
    const early = snapshotModule
      .currentWorkspaceId()
      .then((workspaceId) => readDepensesDebut(workspaceId, '2026-09-12'));
    await expect(drive(early)).rejects.toThrow('REDIRECT /login/2fa');
    expect(h.everIssued).toContain('auth.getUser');
    expect(h.everIssued).not.toContain('expenses');
    expect(h.everIssued).not.toContain('workspace_members');
  });

  it('the whole cockpit read: four waves, the ledger second wave being the last', async () => {
    // A statement, so the ledger's second wave (the debits) has work to do.
    h.tables.account_balance_statements = {
      data: [
        {
          id: 'st-1',
          account_type: 'daily_card',
          balance: 400,
          stated_on: '2026-09-01',
          recorded_at: '2026-09-01T08:00:00Z',
          cancelled_at: null,
        },
      ],
      error: null,
    };
    const { waves } = await drive(
      avecLectureAnticipee('2026-09-12', () => loadMonthSituation('/app', null)).then(
        async ({ lectureAnticipee }) => lectureAnticipee(),
      ),
    );
    // 1 session · 2 users + membership · 3 snapshot, commitments, journal,
    // G-31 · 4 the journal's debits and included flows (lot P4 would merge
    // these two waves of the journal; out of scope here). Sent after the
    // situation, the G-31 read would be a fifth wave.
    expect(waves).toHaveLength(4);
    expect(waveOf(waves, 'account_balance_statements')).toBe(3);
    expect(waveOf(waves, 'movements')).toBe(3);
    expect(waveOf(waves, 'statement_included_flows')).toBe(4);
    // The debits read expenses in wave 4: the statement did give it work.
    expect(waves[3]).toContain('expenses');
    expect(waves[2]).toContain('expenses');
  });
});

describe('/app render — serial waves', () => {
  it('reads users and workspace_members together, right after the session', async () => {
    const { waves } = await drive(
      Promise.all([requireUser(), snapshotModule.getWorkspaceSnapshot()]),
    );
    expect(waveOf(waves, 'auth.getUser')).toBe(1);
    expect(waveOf(waves, 'users')).toBe(2);
    expect(waveOf(waves, 'workspace_members')).toBe(2);
    // The seven snapshot reads need the workspace id, so they are the third wave.
    expect(waveOf(waves, 'workspaces')).toBe(3);
    expect(waves).toHaveLength(3);
  });

  it("sends the page's own read with the snapshot reads, not after them", async () => {
    const { waves, result } = await drive(
      snapshotModule.getSnapshotWith(null, (workspaceId) =>
        pendingCall('page-read', `rows of ${workspaceId}`),
      ),
    );
    expect(waveOf(waves, 'page-read')).toBe(3);
    expect(waveOf(waves, 'workspaces')).toBe(3);
    expect(result[0].workspaceId).toBe('ws-fictif');
    expect(result[1]).toBe('rows of ws-fictif');
  });
});

describe('/app render — redirects keep their order with parallel reads', () => {
  it('sends a user who never onboarded to /onboarding, and never runs the page read', async () => {
    h.tables.users = { data: { onboarded_at: null }, error: null };
    const read = vi.fn(async () => 'never');
    await expect(drive(snapshotModule.getSnapshotWith(null, read))).rejects.toThrow(
      'REDIRECT /onboarding',
    );
    expect(read).not.toHaveBeenCalled();
  });

  it('sends a user without a workspace to /onboarding', async () => {
    h.tables.workspace_members = { data: null, error: null };
    await expect(drive(snapshotModule.getWorkspaceSnapshot())).rejects.toThrow(
      'REDIRECT /onboarding',
    );
  });

  it('checks users BEFORE workspace_members: a failed users read wins over a missing membership', async () => {
    h.tables.users = { data: null, error: { code: '57014' } };
    h.tables.workspace_members = { data: null, error: null };
    await expect(drive(snapshotModule.getWorkspaceSnapshot())).rejects.toThrow(
      'Supabase read unavailable: workspace-snapshot: users.onboarded_at',
    );
  });

  it('never onboarded wins over an unreadable membership, as before', async () => {
    h.tables.users = { data: { onboarded_at: null }, error: null };
    h.tables.workspace_members = { data: null, error: { code: '57014' } };
    await expect(drive(snapshotModule.getWorkspaceSnapshot())).rejects.toThrow(
      'REDIRECT /onboarding',
    );
  });

  it('rejects the whole render when the page read fails', async () => {
    await expect(
      drive(
        snapshotModule.getSnapshotWith(null, () =>
          pendingCall('page-read', null).then(() => {
            throw new Error('page read failed');
          }),
        ),
      ),
    ).rejects.toThrow('page read failed');
  });
});

describe('/app render — outside a render (Server Action)', () => {
  it('resolves the session and the workspace ONCE even when nothing is memoized', async () => {
    h.memoize = false;
    await drive(snapshotModule.getSnapshotWith(null, async (workspaceId) => workspaceId));
    expect(h.getUserCalls).toBe(1);
  });
});

describe('/app render — timing log line', () => {
  it('logs the literal route and three integers, nothing else', async () => {
    await drive(
      snapshotModule.getSnapshotWith('/app/expenses', (workspaceId) =>
        pendingCall('page-read', workspaceId),
      ),
    );
    expect(h.logInfo).toHaveBeenCalledTimes(1);
    const [message, fields] = h.logInfo.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe('app render timing');
    expect(Object.keys(fields).sort()).toEqual(['page_ms', 'route', 'session_ms', 'snapshot_ms']);
    expect(fields.route).toBe('/app/expenses');
    for (const key of ['page_ms', 'session_ms', 'snapshot_ms']) {
      expect(Number.isInteger(fields[key])).toBe(true);
    }
  });

  it('logs nothing when no route is given (Server Action)', async () => {
    await drive(snapshotModule.getSnapshotWith(null, async (workspaceId) => workspaceId));
    expect(h.logInfo).not.toHaveBeenCalled();
  });
});
