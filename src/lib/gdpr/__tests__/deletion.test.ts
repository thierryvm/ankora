import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `src/lib/gdpr/` had no tests at all. These cover the three exported
 * functions — including the two wired into production through
 * `src/lib/actions/settings.ts`, which this PR repointed at the service-role
 * client without exercising.
 *
 * Every statement below was silently refused while that client was degraded to
 * `authenticated`, so these are also the first tests that describe what the
 * deletion flow is supposed to do at all.
 */

const USER_ID = '11111111-2222-3333-4444-555555555555';

type StepResult = { error: { message: string } | null };

/** Keyed `${verb}:${table}` — the shape PostgREST calls actually take. */
const results: Record<string, StepResult> = {};
const calls: string[] = [];
/** Every `.eq(column, value)` applied, so scoping can be asserted. */
const filters: Array<{ op: string; column: string; value: unknown }> = [];

function chain(op: string) {
  calls.push(op);
  const link = {
    eq(column: string, value: unknown) {
      filters.push({ op, column, value });
      return link;
    },
    then(onFulfilled?: (r: StepResult) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(results[op] ?? { error: null }).then(onFulfilled, onRejected);
    },
  };
  return link;
}

const fakeClient = {
  from(table: string) {
    return {
      update: () => chain(`update:${table}`),
      delete: () => chain(`delete:${table}`),
      insert: () => chain(`insert:${table}`),
    };
  },
  auth: {
    admin: {
      deleteUser() {
        calls.push('auth.deleteUser');
        return Promise.resolve(results['auth.deleteUser'] ?? { error: null });
      },
    },
  },
};

vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: () => fakeClient,
}));

const auditSpy = vi.fn();
vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: {
    GDPR_DELETION_REQUESTED: 'gdpr.deletion_requested',
    GDPR_DELETION_COMPLETED: 'gdpr.deletion_completed',
  },
  logAuditEvent: (...args: unknown[]) => auditSpy(...args),
}));

import { cancelDeletion, executeDeletion, requestDeletion } from '../deletion';

beforeEach(() => {
  calls.length = 0;
  filters.length = 0;
  auditSpy.mockClear();
  for (const key of Object.keys(results)) delete results[key];
});

describe('executeDeletion', () => {
  it('stops before deleting anything when audit pseudonymisation fails', async () => {
    results['update:audit_log'] = { error: { message: 'permission denied for table audit_log' } };

    await expect(executeDeletion(USER_ID)).rejects.toThrow(/pseudonymise audit log/i);

    // The point of the throw: the account must NOT be destroyed while rows
    // still carry its user_id, ip_address and user_agent.
    expect(calls).toEqual(['update:audit_log']);
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('never writes the deleted user id back into the audit trail', async () => {
    await executeDeletion(USER_ID);

    expect(calls).toEqual(['update:audit_log', 'delete:workspaces', 'auth.deleteUser']);
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

  it('propagates a workspace deletion failure', async () => {
    results['delete:workspaces'] = { error: { message: 'boom' } };

    await expect(executeDeletion(USER_ID)).rejects.toThrow(/delete workspaces/i);
    expect(calls).not.toContain('auth.deleteUser');
  });

  it('propagates an auth user deletion failure', async () => {
    results['auth.deleteUser'] = { error: { message: 'gotrue down' } };

    await expect(executeDeletion(USER_ID)).rejects.toThrow(/delete auth user/i);
    expect(auditSpy).not.toHaveBeenCalled();
  });
});

describe('requestDeletion', () => {
  it('schedules the erasure 30 days out', async () => {
    const before = Date.now();
    const { scheduledFor } = await requestDeletion(USER_ID);
    const after = Date.now();

    expect(calls).toEqual(['insert:deletion_requests']);

    const scheduled = new Date(scheduledFor).getTime();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    expect(scheduled).toBeGreaterThanOrEqual(before + THIRTY_DAYS);
    expect(scheduled).toBeLessThanOrEqual(after + THIRTY_DAYS);
  });

  it('leaves the audit line to its caller, which has the IP and user agent', async () => {
    await requestDeletion(USER_ID);

    // `requestAccountDeletionAction` emits GDPR_DELETION_REQUESTED with the
    // request context. Emitting it here too wrote two rows per request, one of
    // them missing that context.
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('throws when the request cannot be stored', async () => {
    results['insert:deletion_requests'] = { error: { message: 'unique violation' } };

    await expect(requestDeletion(USER_ID)).rejects.toThrow(/schedule deletion/i);
  });
});

describe('cancelDeletion', () => {
  it('only cancels the caller’s own pending request', async () => {
    await cancelDeletion(USER_ID);

    expect(calls).toEqual(['update:deletion_requests']);
    // Both filters matter: without `status`, a cancellation would also rewrite
    // requests already processed.
    expect(filters).toEqual([
      { op: 'update:deletion_requests', column: 'user_id', value: USER_ID },
      { op: 'update:deletion_requests', column: 'status', value: 'pending' },
    ]);
  });

  it('propagates a cancellation failure', async () => {
    results['update:deletion_requests'] = { error: { message: 'nope' } };

    await expect(cancelDeletion(USER_ID)).rejects.toThrow(/cancel deletion/i);
  });
});
