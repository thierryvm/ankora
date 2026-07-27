import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `exportUserData` had no tests, and this PR changed what it actually does:
 * the client is now genuinely service_role, so RLS no longer silently scopes
 * the reads. Whatever these queries ask for, they now get.
 *
 * That makes the per-query filter the only thing standing between an export and
 * someone else's data — so it is what these tests pin.
 */

const USER_ID = '11111111-2222-3333-4444-555555555555';

const filters: Array<{ table: string; column: string; value: unknown }> = [];
const orders: Array<{ table: string; column: string; ascending: boolean | undefined }> = [];
const limits: Array<{ table: string; count: number }> = [];
const rows: Record<string, unknown[]> = {};

function chain(table: string) {
  const payload = () => ({ data: rows[table] ?? [], error: null });
  const link = {
    eq(column: string, value: unknown) {
      filters.push({ table, column, value });
      return link;
    },
    order(column: string, options?: { ascending?: boolean }) {
      orders.push({ table, column, ascending: options?.ascending });
      return link;
    },
    limit(count: number) {
      limits.push({ table, count });
      return Promise.resolve(payload());
    },
    single() {
      return Promise.resolve({ data: (rows[table] ?? [])[0] ?? {}, error: null });
    },
    then(onFulfilled?: (r: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(payload()).then(onFulfilled, onRejected);
    },
  };
  return link;
}

vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => ({ select: () => chain(table) }),
  }),
}));

const auditSpy = vi.fn();
vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: { GDPR_EXPORT_COMPLETED: 'gdpr.export_completed' },
  logAuditEvent: (...args: unknown[]) => auditSpy(...args),
}));

import { exportUserData } from '../export';

beforeEach(() => {
  filters.length = 0;
  orders.length = 0;
  limits.length = 0;
  auditSpy.mockClear();
  for (const key of Object.keys(rows)) delete rows[key];
});

describe('exportUserData', () => {
  it('scopes every single query to the requesting user', async () => {
    await exportUserData(USER_ID);

    // The service_role key bypasses RLS, so an unscoped query here would hand
    // one user another user's financial data. Assert the exact column each
    // table is filtered on, not merely that a filter exists.
    expect(filters).toEqual([
      { table: 'users', column: 'id', value: USER_ID },
      { table: 'workspaces', column: 'owner_id', value: USER_ID },
      { table: 'charges', column: 'created_by', value: USER_ID },
      { table: 'expenses', column: 'created_by', value: USER_ID },
      { table: 'categories', column: 'created_by', value: USER_ID },
      { table: 'user_consents', column: 'user_id', value: USER_ID },
      { table: 'audit_log', column: 'user_id', value: USER_ID },
    ]);
    // Every table reached is filtered — no query escapes the loop above.
    expect(filters.every((f) => f.value === USER_ID)).toBe(true);
  });

  it('takes the NEWEST audit rows when it truncates, not an arbitrary page', async () => {
    await exportUserData(USER_ID);

    // `audit_log` is the only capped table. Without an explicit order PostgREST
    // returns rows in physical order, so a user past the cap would receive an
    // arbitrary subset — inside a file the UI calls a complete export.
    expect(limits).toEqual([{ table: 'audit_log', count: 1000 }]);
    expect(orders).toEqual([{ table: 'audit_log', column: 'occurred_at', ascending: false }]);
  });

  it('returns each table under its own key and records the export', async () => {
    rows.users = [{ id: USER_ID, email: 'thierry@example.test' }];
    rows.charges = [{ id: 'c1' }, { id: 'c2' }];
    rows.expenses = [{ id: 'e1' }];

    const bundle = await exportUserData(USER_ID);

    expect(bundle.schemaVersion).toBe('1.0');
    expect(bundle.user).toEqual({ id: USER_ID, email: 'thierry@example.test' });
    expect(bundle.charges).toHaveLength(2);
    expect(bundle.expenses).toHaveLength(1);
    expect(bundle.workspaces).toEqual([]);
    expect(new Date(bundle.exportedAt).toString()).not.toBe('Invalid Date');

    const [event, context, metadata] = auditSpy.mock.calls[0] as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(event).toBe('gdpr.export_completed');
    expect(context.userId).toBe(USER_ID);
    // Row counts are fine to record; the exported rows themselves are not.
    expect(metadata).toEqual({ resource_type: 'data_export', count: 3 });
  });

  it('covers only the seven tables it claims — a reminder, not an endorsement', async () => {
    const bundle = await exportUserData(USER_ID);

    // Art. 20 portability is NOT satisfied by these seven: accounts,
    // commitments, charge_payments, commitment_payments, workspace_settings,
    // workspace_members and deletion_requests are all missing. Pinning the
    // current shape means the follow-up PR that widens it has to come here and
    // say so, instead of widening by accident.
    expect(Object.keys(bundle).sort()).toEqual([
      'auditLog',
      'categories',
      'charges',
      'consents',
      'expenses',
      'exportedAt',
      'schemaVersion',
      'user',
      'workspaces',
    ]);
  });
});
