// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The route is the ONLY caller of `executeDeletion` in the system. Its review
 * answers one question — can this fire when it should not? — so most of what
 * follows is about refusing, and the rest is about a run that fails partway
 * without abandoning the accounts behind it.
 */

const SECRET = 'a'.repeat(32);

const { envMock, claimSpy, executeSpy, purgeSpy, logErrorSpy } = vi.hoisted(() => ({
  envMock: { CRON_SECRET: 'a'.repeat(32), NODE_ENV: 'test' } as Record<string, unknown>,
  claimSpy: vi.fn(),
  executeSpy: vi.fn(),
  purgeSpy: vi.fn(),
  logErrorSpy: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: envMock, clientEnv: {} }));
vi.mock('@/lib/gdpr/deletion', () => ({
  claimPendingDeletions: claimSpy,
  executeDeletion: executeSpy,
}));
vi.mock('@/lib/gdpr/retention', () => ({ purgeAuditLogOlderThan12Months: purgeSpy }));
vi.mock('@/lib/log', () => ({
  log: { error: logErrorSpy, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { BATCH_SIZE, GET, maxDuration } from '../route';

function call(authorization?: string) {
  return GET(
    new Request('https://ankora.be/api/cron/gdpr', {
      headers: authorization ? { authorization } : {},
    }),
  );
}

beforeEach(() => {
  envMock.CRON_SECRET = SECRET;
  claimSpy.mockReset().mockResolvedValue([]);
  executeSpy.mockReset().mockResolvedValue(undefined);
  purgeSpy.mockReset().mockResolvedValue(0);
  logErrorSpy.mockReset();
});

describe('authentication — the run refuses by default', () => {
  it('401s with no Authorization header at all', async () => {
    const res = await call();

    expect(res.status).toBe(401);
    // Nothing may be claimed before the caller is authenticated: the 401 has to
    // come before any I/O, which is also what bounds the cost of an unmetered
    // public endpoint.
    expect(claimSpy).not.toHaveBeenCalled();
  });

  it('401s on a header that is not a Bearer token', async () => {
    expect((await call(`Basic ${SECRET}`)).status).toBe(401);
    expect(claimSpy).not.toHaveBeenCalled();
  });

  it('401s on an empty Bearer token', async () => {
    expect((await call('Bearer ')).status).toBe(401);
    expect(claimSpy).not.toHaveBeenCalled();
  });

  it('401s on a wrong secret of the SAME length', async () => {
    expect((await call(`Bearer ${'b'.repeat(32)}`)).status).toBe(401);
  });

  it('401s on a wrong secret of a DIFFERENT length, without throwing', async () => {
    // `timingSafeEqual` REJECTS buffers of unequal length — it throws rather
    // than returning false. Feeding it raw tokens would turn this case into a
    // 500 and leak the expected length through the status code. Both sides are
    // SHA-256'd first, so every comparison is 32 bytes against 32 bytes.
    const res = await call('Bearer short');

    expect(res.status).toBe(401);
    expect(logErrorSpy).not.toHaveBeenCalled();
  });

  it('401s when CRON_SECRET is missing from the environment — and SCREAMS once', async () => {
    envMock.CRON_SECRET = undefined;

    const first = await call(`Bearer ${SECRET}`);
    expect(first.status).toBe(401);
    // The whole point of this case: a configuration failure and a wrong token
    // are indistinguishable to the caller, and must be distinguishable to us.
    expect(logErrorSpy).toHaveBeenCalledTimes(1);
    expect(logErrorSpy.mock.calls[0]?.[0]).toMatch(/CRON_SECRET is not configured/i);
    expect(claimSpy).not.toHaveBeenCalled();

    // …and exactly once per cold start. This endpoint is public and unmetered:
    // without the guard, a scanner hammering the path would write one log line
    // per request for as long as the misconfiguration lasted, which is the same
    // free cost the 401-before-any-I/O was supposed to bound.
    const second = await call(`Bearer ${SECRET}`);
    expect(second.status).toBe(401);
    expect(logErrorSpy).toHaveBeenCalledTimes(1);
  });

  it('200s with the right secret', async () => {
    const res = await call(`Bearer ${SECRET}`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      claimed: 0,
      deleted: 0,
      failed: 0,
      purged: 0,
      purgeOk: true,
      capped: false,
    });
  });
});

describe('the run itself', () => {
  it('isolates a failure so the accounts behind it are still erased', async () => {
    claimSpy.mockResolvedValue([
      { requestId: 'req-1', userId: 'user-1' },
      { requestId: 'req-2', userId: 'user-2' },
      { requestId: 'req-3', userId: 'user-3' },
    ]);
    executeSpy.mockImplementation(async (userId: string) => {
      if (userId === 'user-2') throw new Error('gotrue down');
    });

    const res = await call(`Bearer ${SECRET}`);

    // Vercel NEVER retries a cron. A throw here would abandon every remaining
    // account until tomorrow, so each failure is caught and counted.
    await expect(res.json()).resolves.toMatchObject({ claimed: 3, deleted: 2, failed: 1 });
    expect(executeSpy.mock.calls.map((c) => c[0])).toEqual(['user-1', 'user-2', 'user-3']);
  });

  it('never puts a user id in the failure log — only the request id', async () => {
    claimSpy.mockResolvedValue([{ requestId: 'req-1', userId: 'user-1' }]);
    executeSpy.mockRejectedValue(new Error('boom'));

    await call(`Bearer ${SECRET}`);

    const [, bindings] = logErrorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(bindings.request_id).toBe('req-1');
    // Logging the id of an erasure that just failed would write the identifier
    // back into a durable log, one line after we set out to remove it.
    expect(JSON.stringify(logErrorSpy.mock.calls)).not.toContain('user-1');
  });

  it('purges the audit log at the end of the run', async () => {
    purgeSpy.mockResolvedValue(7);

    await expect((await call(`Bearer ${SECRET}`)).json()).resolves.toMatchObject({ purged: 7 });
  });

  it('reports a purge failure without failing the erasure batch', async () => {
    claimSpy.mockResolvedValue([{ requestId: 'req-1', userId: 'user-1' }]);
    purgeSpy.mockRejectedValue(new Error('purge exploded'));

    const res = await call(`Bearer ${SECRET}`);

    // `purged: null` and `purgeOk: false`, NOT `purged: 0`. Until roughly April
    // 2027 nothing in `audit_log` can be twelve months old, so a healthy run
    // also reports zero — a broken purge would have been written exactly like a
    // purge with nothing to do, for nine months.
    await expect(res.json()).resolves.toMatchObject({
      deleted: 1,
      failed: 0,
      purged: null,
      purgeOk: false,
    });
    expect(logErrorSpy).toHaveBeenCalledTimes(1);
  });

  it('500s when the claim itself fails, rather than reporting a quiet zero', async () => {
    claimSpy.mockRejectedValue(new Error('function does not exist'));

    expect((await call(`Bearer ${SECRET}`)).status).toBe(500);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('flags `capped` AND logs an error when the batch is full', async () => {
    claimSpy.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => ({ requestId: `req-${i}`, userId: `user-${i}` })),
    );

    await expect((await call(`Bearer ${SECRET}`)).json()).resolves.toMatchObject({ capped: true });
    // The cap does not exist to limit work — it exists to make visible the day
    // the queue grows faster than one run a day drains it. A silent 200 would
    // defeat its only purpose.
    expect(logErrorSpy).toHaveBeenCalledTimes(1);
    expect(logErrorSpy.mock.calls[0]?.[0]).toMatch(/batch cap/i);
  });

  it('does not flag `capped` one short of the cap', async () => {
    claimSpy.mockResolvedValue(
      Array.from({ length: 24 }, (_, i) => ({ requestId: `req-${i}`, userId: `user-${i}` })),
    );

    await expect((await call(`Bearer ${SECRET}`)).json()).resolves.toMatchObject({ capped: false });
    expect(logErrorSpy).not.toHaveBeenCalled();
  });

  it('returns counts only — no personal data reaches the invocation log', async () => {
    claimSpy.mockResolvedValue([{ requestId: 'req-1', userId: 'user-1' }]);

    const body = await (await call(`Bearer ${SECRET}`)).json();

    expect(Object.keys(body).sort()).toEqual([
      'capped',
      'claimed',
      'deleted',
      'failed',
      'purgeOk',
      'purged',
    ]);
    expect(JSON.stringify(body)).not.toContain('user-1');
    expect(JSON.stringify(body)).not.toContain('req-1');
  });
});

describe('the invariant that pairs two files', () => {
  it('keeps maxDuration below the 1 hour stale-claim threshold', () => {
    // `claim_pending_deletions()` re-queues rows stuck in `processing` for over
    // an hour. If a live run outlived that threshold, the next run would steal
    // its batch and the same account would be deleted twice. Raising this to
    // 300 s is touching the anti-double-deletion guard, not a timeout.
    expect(maxDuration).toBeLessThan(3600);
  });

  it('keeps BATCH_SIZE within the ceiling the SQL function enforces', () => {
    // `claim_pending_deletions` bounds its own limit with
    // `least(coalesce(batch_size, 1), 100)`. Above 100 the SQL would return 100
    // while `claimed.length >= BATCH_SIZE` never became true — the `capped`
    // alarm would disappear without a sound, which is worse than not having it:
    // it would still LOOK like a guard.
    expect(BATCH_SIZE).toBeLessThanOrEqual(100);
  });
});
