import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The `server-only` wrapper: client injection, the audit line, and the two
 * honest answers the queue forced — a duplicate request that returns the
 * EXISTING deadline, and a cancellation that says when nothing was cancelled.
 *
 * The orchestration itself is covered by `deletion-core.test.ts`, which can be
 * exercised without the privileged client at all.
 *
 * Every statement here was silently refused while the service-role client was
 * degraded to `authenticated` (H3, #192), so these also describe what the
 * deletion flow is supposed to do at all.
 */

const USER_ID = '11111111-2222-3333-4444-555555555555';

type StepResult = {
  data?: unknown;
  error?: { code?: string; message: string } | null;
  count?: number | null;
};

/**
 * Keyed `${verb}:${table}`, queued — `cancelDeletion` and `requestDeletion`
 * each hit `deletion_requests` twice with different verbs, and the follow-up
 * read must be scriptable independently of the write that preceded it.
 */
const results: Record<string, StepResult[]> = {};
const calls: string[] = [];
/** Every `.eq(column, value)` applied, so scoping can be asserted. */
const filters: Array<{ op: string; column: string; value: unknown }> = [];

function program(key: string, result: StepResult) {
  (results[key] ??= []).push(result);
}

function take(key: string): StepResult {
  return results[key]?.shift() ?? { data: null, error: null, count: 0 };
}

function builder(table: string) {
  let op: string | null = null;
  // Only the FIRST verb wins, and it is recorded once: `.update(…).select('id')`
  // is an update whose rows are returned, not an update followed by a select.
  const setOp = (verb: string) => {
    if (op !== null) return;
    op = verb;
    calls.push(`${op}:${table}`);
  };

  const link: Record<string, unknown> = {
    select: () => {
      setOp('select');
      return link;
    },
    insert: () => {
      setOp('insert');
      return link;
    },
    update: () => {
      setOp('update');
      return link;
    },
    delete: () => {
      setOp('delete');
      return link;
    },
    eq: (column: string, value: unknown) => {
      filters.push({ op: `${op}:${table}`, column, value });
      return link;
    },
    // Recorded like `.eq`, and it has to be: the scoping of `cancelDeletion`
    // moved from `.eq('status', …)` to `.in('status', […])`. Left unrecorded,
    // the assertion that a cancellation cannot touch a claimed row would have
    // kept passing while proving nothing.
    in: (column: string, value: unknown) => {
      filters.push({ op: `${op}:${table}`, column, value });
      return link;
    },
    lt: (column: string, value: unknown) => {
      filters.push({ op: `${op}:${table}`, column, value });
      return link;
    },
    order: () => link,
    limit: () => link,
    maybeSingle: async () => take(`${op}:${table}`),
    then: (onFulfilled?: (r: StepResult) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(take(`${op}:${table}`)).then(onFulfilled, onRejected),
  };
  return link;
}

const fakeClient = {
  from: (table: string) => builder(table),
  auth: {
    admin: {
      deleteUser() {
        calls.push('auth.deleteUser');
        return Promise.resolve(take('auth.deleteUser'));
      },
    },
  },
  rpc: (fn: string) => {
    calls.push(`rpc:${fn}`);
    return Promise.resolve(take(`rpc:${fn}`));
  },
};

vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: () => fakeClient,
  createServiceRoleAdminClient: () => fakeClient,
}));

const auditSpy = vi.fn();
vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: {
    GDPR_DELETION_REQUESTED: 'gdpr.deletion_requested',
    GDPR_DELETION_COMPLETED: 'gdpr.deletion_completed',
  },
  logAuditEvent: (...args: unknown[]) => auditSpy(...args),
}));

import {
  cancelDeletion,
  claimPendingDeletions,
  countDeletionsNearBreach,
  countStuckDeletions,
  executeDeletion,
  recordDeletionAttempt,
  requestDeletion,
  retryDeletion,
} from '../deletion';

beforeEach(() => {
  calls.length = 0;
  filters.length = 0;
  auditSpy.mockClear();
  for (const key of Object.keys(results)) delete results[key];
});

describe('executeDeletion', () => {
  it('stops before deleting anything when audit pseudonymisation fails', async () => {
    program('update:audit_log', { error: { message: 'permission denied for table audit_log' } });

    await expect(executeDeletion(USER_ID)).rejects.toThrow(/pseudonymise audit log/i);

    // The point of the throw: the account must NOT be destroyed while rows
    // still carry its user_id, ip_address and user_agent.
    expect(calls).toEqual(['update:audit_log']);
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('never writes the deleted user id back into the audit trail', async () => {
    program('update:audit_log', { error: null, count: 3 });

    await executeDeletion(USER_ID);

    // No `delete:workspaces`. It was redundant with the cascade from
    // `public.users` (ADR-024 D1), and every redundant statement is one more
    // way to half-fail.
    expect(calls).toEqual(['update:audit_log', 'auth.deleteUser']);
    expect(auditSpy).toHaveBeenCalledTimes(1);

    const [event, context, metadata] = auditSpy.mock.calls[0] as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(event).toBe('gdpr.deletion_completed');
    expect(context.userId).toBeNull();
    expect(metadata).toEqual({ resource_type: 'user' });
    // Explicit: `resource_id` would survive pseudonymisation (jsonb is not
    // cascaded by `on delete set null`) and re-identify the erased account.
    expect(JSON.stringify(metadata)).not.toContain(USER_ID);
  });

  it('propagates an auth user deletion failure', async () => {
    program('auth.deleteUser', { error: { message: 'gotrue down' } });

    await expect(executeDeletion(USER_ID)).rejects.toThrow(/delete auth user/i);
    expect(auditSpy).not.toHaveBeenCalled();
  });
});

describe('requestDeletion', () => {
  it('schedules the erasure 14 days out', async () => {
    const before = Date.now();
    const result = await requestDeletion(USER_ID);
    const after = Date.now();

    // The discriminant is asserted first, and not just narrowed: an action that
    // reads `.scheduledFor` off the wrong branch is exactly the defect the
    // union exists to make impossible.
    expect(result.kind).toBe('scheduled');
    const scheduledFor = result.kind === 'scheduled' ? result.scheduledFor : '';

    expect(calls).toEqual(['insert:deletion_requests']);

    // 14, not 30 (ADR-023): at 30 the erasure landed on the exact edge of the
    // one-month deadline of art. 12(3), so one failed run put us out of time.
    // The shortened window ships WITH the executor and never before.
    const scheduled = new Date(scheduledFor).getTime();
    const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
    expect(scheduled).toBeGreaterThanOrEqual(before + FOURTEEN_DAYS);
    expect(scheduled).toBeLessThanOrEqual(after + FOURTEEN_DAYS);
  });

  it('returns the EXISTING deadline when a request is already in flight', async () => {
    // 23505 on `deletion_requests_one_active_idx`. Returning the new date would
    // state a deadline the queue will never honour — it keeps the first one.
    program('insert:deletion_requests', {
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    program('select:deletion_requests', {
      data: { scheduled_for: '2026-08-10T00:00:00.000Z', status: 'pending' },
      error: null,
    });

    const result = await requestDeletion(USER_ID);

    expect(result).toEqual({ kind: 'scheduled', scheduledFor: '2026-08-10T00:00:00.000Z' });
    expect(calls).toEqual(['insert:deletion_requests', 'select:deletion_requests']);
  });

  it('answers `already_failed` — never a deadline — when the existing request is quarantined', async () => {
    // A `failed` row has NO honourable deadline: it is out of the batch and
    // will never be claimed again. Returning its `scheduled_for` would be
    // precisely what the 23505 branch exists to prevent — stating a date the
    // queue will not honour. This is also the branch that keeps art. 17 open:
    // without `failed` in the lookup, this call would find nothing and THROW,
    // and the person could never re-request their own erasure.
    program('insert:deletion_requests', {
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    program('select:deletion_requests', {
      data: { scheduled_for: '2026-08-01T00:00:00.000Z', status: 'failed' },
      error: null,
    });

    await expect(requestDeletion(USER_ID)).resolves.toEqual({ kind: 'already_failed' });

    // And the lookup covers all three ACTIVE statuses — the same three the
    // uniqueness index covers. Any narrower and the branch above is dead code.
    expect(filters).toContainEqual({
      op: 'select:deletion_requests',
      column: 'status',
      value: ['pending', 'processing', 'failed'],
    });
  });

  it('still throws when the conflicting request cannot be found afterwards', async () => {
    // Narrow race: the insert conflicts, but by the time we look the row is
    // gone (cancelled, or cascaded away with the account). Inventing a date
    // here would state a deadline nothing will honour, so the caller is told
    // the request failed.
    program('insert:deletion_requests', {
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    program('select:deletion_requests', { data: null, error: null });

    await expect(requestDeletion(USER_ID)).rejects.toThrow(/schedule deletion/i);
  });

  it('leaves the audit line to its caller, which has the IP and user agent', async () => {
    await requestDeletion(USER_ID);

    // `requestAccountDeletionAction` emits GDPR_DELETION_REQUESTED with the
    // request context. Emitting it here too wrote two rows per request, one of
    // them missing that context.
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('throws when the request cannot be stored for any other reason', async () => {
    program('insert:deletion_requests', { error: { code: '42501', message: 'permission denied' } });

    await expect(requestDeletion(USER_ID)).rejects.toThrow(/schedule deletion/i);
  });
});

describe('cancelDeletion', () => {
  it('cancels the caller’s own request, whether it is pending or quarantined', async () => {
    program('update:deletion_requests', { data: [{ id: 'req-1' }], error: null });

    await expect(cancelDeletion(USER_ID)).resolves.toEqual({ cancelled: true });

    expect(calls).toEqual(['update:deletion_requests']);
    // Both filters matter, and each for its own reason. Without `user_id`, one
    // cancellation would reach another person's row. Without the status list,
    // it would also rewrite a request a run has already claimed.
    //
    // `failed` is in that list because the screen offers the button there —
    // and it MUST be: while the filter said `pending` alone, cancelling a
    // quarantined request touched zero rows and still reported success, so the
    // button announced a cancellation over a screen still showing the failure.
    // `processing` stays out: a run owns that row.
    expect(filters).toEqual([
      { op: 'update:deletion_requests', column: 'user_id', value: USER_ID },
      { op: 'update:deletion_requests', column: 'status', value: ['pending', 'failed'] },
    ]);
  });

  it('reports `in_progress` rather than a false success once a run owns the row', async () => {
    program('update:deletion_requests', { data: [], error: null });
    program('select:deletion_requests', { data: { id: 'req-1' }, error: null });

    await expect(cancelDeletion(USER_ID)).resolves.toEqual({
      cancelled: false,
      reason: 'in_progress',
    });
  });

  it('reports `none` when there was nothing to cancel', async () => {
    program('update:deletion_requests', { data: [], error: null });
    program('select:deletion_requests', { data: null, error: null });

    await expect(cancelDeletion(USER_ID)).resolves.toEqual({ cancelled: false, reason: 'none' });
  });

  it('propagates a cancellation failure', async () => {
    program('update:deletion_requests', { error: { message: 'nope' } });

    await expect(cancelDeletion(USER_ID)).rejects.toThrow(/cancel deletion/i);
  });
});

describe('retryDeletion', () => {
  it('re-arms a quarantined request and resets the attempt CYCLE', async () => {
    program('update:deletion_requests', { data: [{ id: 'req-1' }], error: null });

    await expect(retryDeletion(USER_ID)).resolves.toEqual({ retried: true });

    // Only a `failed` row, and only the caller's own. `pending` is absent on
    // purpose: relaunching something already in the queue is a no-op that would
    // silently reset a live attempt counter.
    expect(filters).toEqual([
      { op: 'update:deletion_requests', column: 'user_id', value: USER_ID },
      { op: 'update:deletion_requests', column: 'status', value: 'failed' },
    ]);
  });

  it('reports that nothing moved rather than a false success', async () => {
    // Two tabs open, a claim in between: the relaunch lands on a row that is no
    // longer `failed`. This is the same defect class as a cancellation that
    // cancels nothing and says it did.
    program('update:deletion_requests', { data: [], error: null });

    await expect(retryDeletion(USER_ID)).resolves.toEqual({ retried: false });
  });

  it('propagates a relaunch failure', async () => {
    program('update:deletion_requests', { error: { message: 'nope' } });

    await expect(retryDeletion(USER_ID)).rejects.toThrow(/retry deletion/i);
  });
});

describe('recordDeletionAttempt', () => {
  it('returns the number of rows touched, because zero is a real outcome here', async () => {
    program('update:deletion_requests', { data: [{ id: 'req-1' }], error: null });

    await expect(recordDeletionAttempt('req-1', 'gotrue_error')).resolves.toBe(1);
    expect(filters).toEqual([{ op: 'update:deletion_requests', column: 'id', value: 'req-1' }]);
  });

  it('returns 0 — WITHOUT raising — when the privileged write touches nothing', async () => {
    // `deletion_requests` carries FORCE ROW LEVEL SECURITY, where a privileged
    // write can match no row and report success. If this returned `void`, the
    // attempt counter could stop being written and nothing would ever say so —
    // the exact mute failure this whole change removes. The caller checks the
    // count and logs.
    program('update:deletion_requests', { data: [], error: null });

    await expect(recordDeletionAttempt('req-1', 'unknown')).resolves.toBe(0);
  });

  it('propagates a write failure', async () => {
    program('update:deletion_requests', { error: { message: 'nope' } });

    await expect(recordDeletionAttempt('req-1', 'unknown')).rejects.toThrow(
      /record deletion attempt/i,
    );
  });
});

describe('the admin counters', () => {
  /** Two reads per call, issued in order: quarantined first, near-breach second. */
  function programBothCounts(stuck: number, nearBreach: number) {
    program('select:deletion_requests', { count: stuck, error: null });
    program('select:deletion_requests', { count: nearBreach, error: null });
  }

  it('counts quarantined requests and nothing else', async () => {
    programBothCounts(3, 9);

    await expect(countStuckDeletions()).resolves.toBe(3);
    expect(filters).toContainEqual({
      op: 'select:deletion_requests',
      column: 'status',
      value: 'failed',
    });
  });

  it('counts EVERY non-terminal request near the deadline, not just the failed ones', async () => {
    // The width is the point. A `pending` row starved by influx never becomes
    // `failed`, and anyone relaunching every four days keeps their row out of
    // quarantine for ever: a `failed`-only counter would read 0 through both,
    // while the art. 12(3) clock kept running. What is watched is the BREACH,
    // not one of its causes.
    programBothCounts(0, 1);

    await expect(countDeletionsNearBreach()).resolves.toBe(1);

    expect(filters).toContainEqual({
      op: 'select:deletion_requests',
      column: 'status',
      value: ['pending', 'processing', 'failed'],
    });

    // 25 days back — one month minus the five-day quarantine window.
    const cutoff = filters.find((f) => f.column === 'requested_at');
    const age = Date.now() - new Date(String(cutoff?.value)).getTime();
    expect(age).toBeGreaterThanOrEqual(24 * 24 * 60 * 60 * 1000);
    expect(age).toBeLessThanOrEqual(26 * 24 * 60 * 60 * 1000);
  });

  it('propagates a counting failure instead of reporting a confident zero', async () => {
    program('select:deletion_requests', { error: { message: 'permission denied' } });
    program('select:deletion_requests', { count: 0, error: null });

    await expect(countStuckDeletions()).rejects.toThrow(/count stuck deletions/i);
  });
});

describe('claimPendingDeletions', () => {
  it('maps the SQL row shape onto the caller’s shape', async () => {
    program('rpc:claim_pending_deletions', {
      data: [{ request_id: 'req-1', target_user_id: USER_ID }],
      error: null,
    });

    await expect(claimPendingDeletions(25)).resolves.toEqual([
      { requestId: 'req-1', userId: USER_ID },
    ]);
  });
});
