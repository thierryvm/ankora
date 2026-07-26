import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `executeDeletion` is the most destructive function in the repository and had
 * zero tests. These cover the two behaviours the H3 fix changes — and that the
 * H3 fix ACTIVATES, since every statement below was silently refused while the
 * service_role client was degraded to `authenticated`.
 */

const USER_ID = '11111111-2222-3333-4444-555555555555';

type StepResult = { error: { message: string } | null };

const steps = {
  pseudonymise: { error: null } as StepResult,
  deleteWorkspaces: { error: null } as StepResult,
  deleteUser: { error: null } as StepResult,
};

const calls: string[] = [];

const fakeClient = {
  from(table: string) {
    return {
      update() {
        return {
          eq() {
            calls.push(`update:${table}`);
            return Promise.resolve(steps.pseudonymise);
          },
        };
      },
      delete() {
        return {
          eq() {
            calls.push(`delete:${table}`);
            return Promise.resolve(steps.deleteWorkspaces);
          },
        };
      },
    };
  },
  auth: {
    admin: {
      deleteUser() {
        calls.push('auth.deleteUser');
        return Promise.resolve(steps.deleteUser);
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

import { executeDeletion } from '../deletion';

beforeEach(() => {
  calls.length = 0;
  auditSpy.mockClear();
  steps.pseudonymise = { error: null };
  steps.deleteWorkspaces = { error: null };
  steps.deleteUser = { error: null };
});

describe('executeDeletion', () => {
  it('stops before deleting anything when audit pseudonymisation fails', async () => {
    steps.pseudonymise = { error: { message: 'permission denied for table audit_log' } };

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
    steps.deleteWorkspaces = { error: { message: 'boom' } };

    await expect(executeDeletion(USER_ID)).rejects.toThrow(/delete workspaces/i);
    expect(calls).not.toContain('auth.deleteUser');
  });
});
