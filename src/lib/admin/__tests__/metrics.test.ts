import { describe, expect, it, vi } from 'vitest';

// The real module validates the environment on import; every read here goes
// through the injected client instead.
vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: () => {
    throw new Error('the privileged client must be injected in these tests');
  },
}));
const logError = vi.fn();
vi.mock('@/lib/log', () => ({
  log: {
    error: (...args: unknown[]) => logError(...args),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { buildSha, readAdminMetricsWith, type AdminMetricsClient } from '@/lib/admin/metrics';

type Call = [method: string, args: unknown[]];
type Query = { table: string; calls: Call[] };
type Result = { data?: unknown; count?: number | null; error?: { message: string } | null };

/**
 * A chainable stand-in for the PostgREST builder: every method records itself
 * and returns the builder; awaiting it asks `answer` for the result.
 */
function fakeClient(answer: (q: Query) => Result): AdminMetricsClient {
  return {
    from(table: string) {
      const query: Query = { table, calls: [] };
      const builder: object = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === 'then') {
              return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
                Promise.resolve({ data: null, count: null, error: null, ...answer(query) }).then(
                  ok,
                  ko,
                );
            }
            return (...args: unknown[]) => {
              query.calls.push([String(prop), args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  } as unknown as AdminMetricsClient;
}

const NOW = new Date('2026-10-02T12:00:00Z');
const UUID = '3f2b8c1e-9d4a-4e7b-8a1c-5d6e7f8a9b0c';
const has = (q: Query, method: string, ...args: unknown[]) =>
  q.calls.some(([m, a]) => m === method && JSON.stringify(a) === JSON.stringify(args));

/** Plenty of rows everywhere, each one carrying the columns that must never leak. */
function generousAnswer(q: Query): Result {
  const nominative = {
    email: 'personne@example.test',
    user_id: UUID,
    ip_address: '203.0.113.7',
    user_agent: 'Mozilla/5.0',
    name: 'Espace de quelqu’un',
  };
  const isCount = q.calls.some(
    ([m, a]) => m === 'select' && JSON.stringify(a).includes('"head":true'),
  );
  if (isCount && q.table === 'user_consents')
    return { count: has(q, 'eq', 'granted', true) ? 3 : 2 };
  if (isCount) return { count: 42 };
  if (q.table === 'users') {
    return {
      data: Array.from({ length: 9 }, () => ({
        created_at: '2026-09-29T10:00:00Z',
        ...nominative,
      })),
      count: 9,
    };
  }
  if (q.table === 'audit_log') {
    return {
      data: Array.from({ length: 7 }, (_, i) => ({
        workspace_id: `${UUID.slice(0, -1)}${i}`,
        occurred_at: '2026-10-02T08:00:00Z',
        ...nominative,
      })),
      count: 7,
    };
  }
  return { data: [], count: 0 };
}

describe('readAdminMetricsWith', () => {
  it('lets nothing nominative out, even when the database hands it over', async () => {
    const metrics = await readAdminMetricsWith(fakeClient(generousAnswer), NOW, undefined);
    const out = JSON.stringify(metrics);
    expect(out).not.toMatch(/@/);
    expect(out).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(out).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(out).not.toMatch(/Mozilla|Espace de/);
    // …and the blocks are really there, so the test is not passing on emptiness.
    expect(metrics.users).not.toBeNull();
    expect(metrics.activity).toEqual({ day1: 5, days7: 5, days30: 5 });
    expect(metrics.gdpr.analyticsConsent).toEqual({
      granted: '< 5',
      refused: '< 5',
      neverChosen: 35,
    });
  });

  it('never selects a nominative column in a read that returns rows', async () => {
    // A `head: true` count returns zero columns whatever it names; only reads
    // that bring rows back are held to the column list.
    const selects: string[] = [];
    await readAdminMetricsWith(
      fakeClient((q) => {
        for (const [m, a] of q.calls) {
          if (m === 'select' && !JSON.stringify(a).includes('"head":true'))
            selects.push(String(a[0]));
        }
        return generousAnswer(q);
      }),
      NOW,
      undefined,
    );
    expect(selects.length).toBeGreaterThan(0);
    for (const s of selects) expect(s).not.toMatch(/email|ip_address|user_agent|user_id|name|\*/);
  });

  it('counts activity only from writes, over the last thirty days', async () => {
    let auditQuery: Query | null = null;
    await readAdminMetricsWith(
      fakeClient((q) => {
        if (
          q.table === 'audit_log' &&
          !q.calls.some(([m, a]) => m === 'select' && JSON.stringify(a).includes('head'))
        ) {
          auditQuery = q;
        }
        return generousAnswer(q);
      }),
      NOW,
      undefined,
    );
    expect(auditQuery).not.toBeNull();
    const q = auditQuery as unknown as Query;
    const inCall = q.calls.find(([m, a]) => m === 'in' && a[0] === 'event_type');
    const events = (inCall?.[1][1] ?? []) as string[];
    expect(events).toContain('charge.created');
    expect(events).toContain('charge.payment_toggled');
    expect(events.some((e) => e.startsWith('auth.') || e.startsWith('admin.'))).toBe(false);
    expect(has(q, 'gte', 'occurred_at', '2026-09-02T12:00:00.000Z')).toBe(true);
  });

  it('a block that cannot be read becomes null; the others still answer', async () => {
    const metrics = await readAdminMetricsWith(
      fakeClient((q) =>
        q.table === 'audit_log' ? { error: { message: 'boom' } } : generousAnswer(q),
      ),
      NOW,
      undefined,
    );
    expect(metrics.activity).toBeNull();
    expect(metrics.security).toBeNull();
    expect(metrics.users).not.toBeNull();
    expect(metrics.gdpr.deletions).not.toBeNull();
    // The failure is said, by block name, without any row in it.
    expect(logError).toHaveBeenCalledWith(
      'Admin: failed to read a metrics block',
      expect.objectContaining({ block: 'activity', error_message: 'boom' }),
    );
  });

  const pagedAudit = (q: Query) =>
    q.table === 'audit_log' &&
    !q.calls.some(([m, a]) => m === 'select' && JSON.stringify(a).includes('head'));
  const row = { workspace_id: 'w', occurred_at: '2026-10-02T08:00:00Z' };

  it('refuses to undercount: an activity read past its page budget is null', async () => {
    const metrics = await readAdminMetricsWith(
      fakeClient((q) =>
        pagedAudit(q)
          ? { data: Array.from({ length: 1000 }, () => row), count: 25_000 }
          : generousAnswer(q),
      ),
      NOW,
      undefined,
    );
    expect(metrics.activity).toBeNull();
  });

  it('a short page is not the end: it reads on until the announced row count', async () => {
    // The server's `max_rows` may be lower than the page size asked for.
    const ranges: unknown[][] = [];
    const metrics = await readAdminMetricsWith(
      fakeClient((q) => {
        if (!pagedAudit(q)) return generousAnswer(q);
        const range = q.calls.find(([m]) => m === 'range')?.[1] ?? [];
        ranges.push(range);
        const from = Number(range[0]);
        const ws = (i: number) => ({ ...row, workspace_id: `w${i}` });
        return {
          data: from < 600 ? Array.from({ length: 300 }, (_, i) => ws(from + i)) : [],
          count: 600,
        };
      }),
      NOW,
      undefined,
    );
    expect(ranges.map((r) => r[0])).toEqual([0, 300]);
    expect(metrics.activity).toEqual({ day1: 600, days7: 600, days30: 600 });
  });

  it('a read that ends before the announced row count is null, not a smaller number', async () => {
    const metrics = await readAdminMetricsWith(
      fakeClient((q) => {
        if (!pagedAudit(q)) return generousAnswer(q);
        const from = Number(q.calls.find(([m]) => m === 'range')?.[1][0]);
        return { data: from === 0 ? [row] : [], count: 50 };
      }),
      NOW,
      undefined,
    );
    expect(metrics.activity).toBeNull();
  });

  it('an absent count is « could not look », never zero', async () => {
    const metrics = await readAdminMetricsWith(
      fakeClient((q) => (q.table === 'users' ? { count: null, data: null } : generousAnswer(q))),
      NOW,
      undefined,
    );
    expect(metrics.users).toBeNull();
    expect(metrics.gdpr.analyticsConsent).toBeNull();
  });

  it("does not count the founder's own admin visits as a security event", async () => {
    const metrics = await readAdminMetricsWith(fakeClient(generousAnswer), NOW, undefined);
    expect(metrics.security?.map((e) => e.event)).not.toContain('admin.access.granted');
  });

  it('keeps the deletion queue exact: each request is a legal deadline to act on', async () => {
    const metrics = await readAdminMetricsWith(
      fakeClient((q) => (q.table === 'deletion_requests' ? { count: 2 } : generousAnswer(q))),
      NOW,
      undefined,
    );
    expect(metrics.gdpr.deletions).toEqual({ stuck: 2, nearBreach: 2 });
  });
});

describe('buildSha', () => {
  it('shortens the deployed commit and says « local » otherwise', () => {
    expect(buildSha('fa5d9ca691fc2ef04c6f950e8bf65624f74ee736')).toBe('fa5d9ca');
    expect(buildSha(undefined)).toBe('local');
    expect(buildSha('')).toBe('local');
    expect(buildSha('<script>')).toBe('local');
  });
});
