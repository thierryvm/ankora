import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `exportUserData` runs on a genuine service_role client, so RLS does not
 * scope the reads: whatever these queries ask for, they get. The per-query
 * filter is the only thing standing between an export and someone else's
 * data — so it is what these tests pin, table by table.
 */

const USER_ID = '11111111-2222-3333-4444-555555555555';
const WS_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const WS_B = 'bbbbbbbb-0000-0000-0000-000000000002';

type Filter = { table: string; op: 'eq' | 'in'; column: string; value: unknown };
type Row = Record<string, unknown>;

const filters: Filter[] = [];
const selects: Array<{ table: string; columns: string }> = [];
const orders: Array<{ table: string; column: string; ascending: boolean | undefined }> = [];
const limits: Array<{ table: string; count: number }> = [];
const rows: Record<string, unknown[]> = {};
const errors: Record<string, { message: string }> = {};
// PostgREST cuts a response at max_rows without an error; the mock does too.
let serverMaxRows = 1000;

function chain(table: string) {
  const payload = () => ({ data: rows[table] ?? [], error: errors[table] ?? null });
  const link = {
    eq(column: string, value: unknown) {
      filters.push({ table, op: 'eq', column, value });
      return link;
    },
    in(column: string, value: unknown) {
      filters.push({ table, op: 'in', column, value });
      return link;
    },
    order(column: string, options?: { ascending?: boolean }) {
      orders.push({ table, column, ascending: options?.ascending });
      return link;
    },
    range(from: number, to: number) {
      const all = rows[table] ?? [];
      const end = Math.min(to + 1, from + serverMaxRows);
      return Promise.resolve({ data: all.slice(from, end), error: errors[table] ?? null });
    },
    limit(count: number) {
      limits.push({ table, count });
      return Promise.resolve(payload());
    },
    single() {
      return Promise.resolve({
        data: (rows[table] ?? [])[0] ?? {},
        error: errors[table] ?? null,
      });
    },
    then(onFulfilled?: (r: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(payload()).then(onFulfilled, onRejected);
    },
  };
  return link;
}

vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => {
        selects.push({ table, columns });
        return chain(table);
      },
    }),
  }),
}));

const auditSpy = vi.fn();
vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: { GDPR_EXPORT_COMPLETED: 'gdpr.export_completed' },
  logAuditEvent: (...args: unknown[]) => auditSpy(...args),
}));

import { exportUserData, EXPORTED_TABLES, TABLES_NOT_EXPORTED } from '../export';

beforeEach(() => {
  filters.length = 0;
  selects.length = 0;
  orders.length = 0;
  limits.length = 0;
  auditSpy.mockClear();
  for (const key of Object.keys(rows)) delete rows[key];
  for (const key of Object.keys(errors)) delete errors[key];
  serverMaxRows = 1000;
});

/** Distinct filters on a table — a paged read repeats the same one per page. */
function filtersOn(table: string) {
  const seen = new Map<string, Filter>();
  for (const f of filters.filter((x) => x.table === table)) seen.set(JSON.stringify(f), f);
  return [...seen.values()];
}

describe('exportUserData — the seven original tables', () => {
  it('scopes each of them to the requesting user, on the same column as before', async () => {
    await exportUserData(USER_ID);

    // Assert the exact column each table is filtered on, not merely that a
    // filter exists: the service_role key bypasses RLS.
    expect(filtersOn('users')).toEqual([
      { table: 'users', op: 'eq', column: 'id', value: USER_ID },
    ]);
    expect(filtersOn('workspaces')).toEqual([
      { table: 'workspaces', op: 'eq', column: 'owner_id', value: USER_ID },
    ]);
    for (const table of ['charges', 'expenses', 'categories']) {
      expect(filtersOn(table)).toEqual([{ table, op: 'eq', column: 'created_by', value: USER_ID }]);
    }
    expect(filtersOn('user_consents')).toEqual([
      { table: 'user_consents', op: 'eq', column: 'user_id', value: USER_ID },
    ]);
    expect(filtersOn('audit_log')).toEqual([
      { table: 'audit_log', op: 'eq', column: 'user_id', value: USER_ID },
    ]);
  });

  it('reads the WHOLE audit trail, newest first, past the server cap', async () => {
    // A cap BELOW the page size: advancing by the page size would skip rows.
    serverMaxRows = 700;
    rows.audit_log = Array.from({ length: 1001 }, (_, i) => ({
      id: 1001 - i,
      occurred_at: new Date(Date.UTC(2026, 0, 1) - i * 60_000).toISOString(),
    }));

    const bundle = await exportUserData(USER_ID);

    // No cap at all. Since every financial gesture writes an audit row, an
    // active person passes 1 000 rows inside a year; the former `.limit(1000)`
    // dropped the oldest of them silently, in a file the UI calls complete.
    expect(limits).toEqual([]);
    expect(bundle.auditLog).toHaveLength(1001);
    expect(bundle.auditLog.map((r) => r.id)).toEqual(rows.audit_log.map((r) => (r as Row).id));
    // `occurred_at` alone is not a total order: two events in the same instant
    // would make paging skip or repeat rows. `id` closes it.
    expect(orders.filter((o) => o.table === 'audit_log').slice(0, 2)).toEqual([
      { table: 'audit_log', column: 'occurred_at', ascending: false },
      { table: 'audit_log', column: 'id', ascending: true },
    ]);
  });

  it('keeps the keys and the shape an export made yesterday had', async () => {
    rows.users = [{ id: USER_ID, email: 'thierry@example.test' }];
    rows.charges = [{ id: 'c1' }, { id: 'c2' }];
    rows.expenses = [{ id: 'e1' }];

    const bundle = await exportUserData(USER_ID);

    expect(bundle.user).toEqual({ id: USER_ID, email: 'thierry@example.test' });
    expect(bundle.charges).toEqual([{ id: 'c1' }, { id: 'c2' }]);
    expect(bundle.expenses).toEqual([{ id: 'e1' }]);
    expect(bundle.workspaces).toEqual([]);
    expect(new Date(bundle.exportedAt).toString()).not.toBe('Invalid Date');
    // Every key of the 1.0 format is still there, under the same name.
    for (const key of [
      'schemaVersion',
      'exportedAt',
      'user',
      'workspaces',
      'charges',
      'expenses',
      'categories',
      'consents',
      'auditLog',
    ]) {
      expect(bundle).toHaveProperty(key);
    }

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

  it('announces the additive change through schemaVersion 1.1', async () => {
    const bundle = await exportUserData(USER_ID);
    // 1.0 → 1.1: keys were added, none renamed or reshaped. A reader of a 1.0
    // file reads a 1.1 file unchanged.
    expect(bundle.schemaVersion).toBe('1.1');
  });
});

describe('exportUserData — the tables art. 20 was missing', () => {
  it('exports the balances of the workspaces the user OWNS, and only those', async () => {
    rows.workspaces = [{ id: WS_A }, { id: WS_B }];
    rows.accounts = [{ workspace_id: WS_A, kind: 'principal', balance: 1200 }];

    const bundle = await exportUserData(USER_ID);

    // `accounts` has no user column: it hangs off the workspace. The id list
    // comes from the owner-scoped `workspaces` read, never from the caller.
    expect(filtersOn('accounts')).toEqual([
      { table: 'accounts', op: 'in', column: 'workspace_id', value: [WS_A, WS_B] },
    ]);
    expect(bundle.accounts).toEqual([{ workspace_id: WS_A, kind: 'principal', balance: 1200 }]);
  });

  it('exports the settings of the workspaces the user owns', async () => {
    rows.workspaces = [{ id: WS_A }];
    rows.workspace_settings = [{ workspace_id: WS_A, savings_balance: 300 }];

    const bundle = await exportUserData(USER_ID);

    expect(filtersOn('workspace_settings')).toEqual([
      { table: 'workspace_settings', op: 'in', column: 'workspace_id', value: [WS_A] },
    ]);
    expect(bundle.workspaceSettings).toEqual([{ workspace_id: WS_A, savings_balance: 300 }]);
  });

  it('does not query workspace-scoped tables at all when the user owns no workspace', async () => {
    const bundle = await exportUserData(USER_ID);

    // An `in` on an empty list is a query whose meaning depends on the driver;
    // not issuing it is the only reading that cannot widen.
    expect(filtersOn('accounts')).toEqual([]);
    expect(filtersOn('workspace_settings')).toEqual([]);
    expect(bundle.accounts).toEqual([]);
    expect(bundle.workspaceSettings).toEqual([]);
  });

  it('exports the debts the user recorded', async () => {
    rows.commitments = [{ id: 'k1', label: 'Prêt auto' }];
    const bundle = await exportUserData(USER_ID);
    expect(filtersOn('commitments')).toEqual([
      { table: 'commitments', op: 'eq', column: 'created_by', value: USER_ID },
    ]);
    expect(bundle.commitments).toEqual([{ id: 'k1', label: 'Prêt auto' }]);
  });

  it('exports the instalments the user marked paid', async () => {
    rows.commitment_payments = [{ id: 'kp1', paid_amount: 250 }];
    const bundle = await exportUserData(USER_ID);
    expect(filtersOn('commitment_payments')).toEqual([
      { table: 'commitment_payments', op: 'eq', column: 'created_by', value: USER_ID },
    ]);
    expect(bundle.commitmentPayments).toEqual([{ id: 'kp1', paid_amount: 250 }]);
  });

  it('exports the bills the user marked paid', async () => {
    rows.charge_payments = [{ id: 'cp1', paid_amount: 59 }];
    const bundle = await exportUserData(USER_ID);
    expect(filtersOn('charge_payments')).toEqual([
      { table: 'charge_payments', op: 'eq', column: 'created_by', value: USER_ID },
    ]);
    expect(bundle.chargePayments).toEqual([{ id: 'cp1', paid_amount: 59 }]);
  });

  it("exports the user's OWN memberships, never a co-member's row", async () => {
    rows.workspace_members = [{ workspace_id: WS_A, role: 'owner', joined_at: '2026-04-16' }];
    const bundle = await exportUserData(USER_ID);

    expect(filtersOn('workspace_members')).toEqual([
      { table: 'workspace_members', op: 'eq', column: 'user_id', value: USER_ID },
    ]);
    // `user_id` is left out on purpose: it is the exporter's own id, already
    // under `user`, and naming the column invites a `*` that would not be.
    expect(selects.find((s) => s.table === 'workspace_members')?.columns).toBe(
      'workspace_id, role, joined_at',
    );
    expect(bundle.workspaceMemberships).toEqual([
      { workspace_id: WS_A, role: 'owner', joined_at: '2026-04-16' },
    ]);
  });

  it('exports deletion requests without the queue internals', async () => {
    rows.deletion_requests = [{ status: 'cancelled', reason: 'test' }];
    const bundle = await exportUserData(USER_ID);

    expect(filtersOn('deletion_requests')).toEqual([
      { table: 'deletion_requests', op: 'eq', column: 'user_id', value: USER_ID },
    ]);
    // claimed_at, attempts, last_error_code… describe our worker, not the
    // person. An explicit list keeps a future internal column out by default.
    const columns = selects.find((s) => s.table === 'deletion_requests')?.columns ?? '';
    expect(columns).toBe(
      'requested_at, scheduled_for, status, reason, cancelled_at, completed_at, retried_at',
    );
    expect(columns).not.toMatch(/claimed|attempt|error|id/);
    expect(bundle.deletionRequests).toEqual([{ status: 'cancelled', reason: 'test' }]);
  });

  it('never issues an unfiltered query', async () => {
    rows.workspaces = [{ id: WS_A }];
    await exportUserData(USER_ID);

    const queried = new Set(selects.map((s) => s.table));
    for (const table of queried) {
      expect(filtersOn(table).length, `${table} has no filter`).toBeGreaterThan(0);
    }
    // Every filter targets the user, or the workspaces the user owns.
    for (const f of filters) {
      if (f.op === 'eq') expect(f.value).toBe(USER_ID);
      else expect(f.value).toEqual([WS_A]);
    }
  });

  it.each(EXPORTED_TABLES)(
    'fails loudly when reading %s fails, instead of exporting it empty',
    async (table) => {
      rows.workspaces = [{ id: WS_A }];
      errors[table] = { message: 'boom' };
      // A silent `data ?? []` would produce a file the UI calls complete, with
      // this table quietly absent.
      await expect(exportUserData(USER_ID)).rejects.toThrow(`reading ${table} failed`);
      expect(auditSpy).not.toHaveBeenCalled();
    },
  );

  it.each([
    'charges',
    'expenses',
    'categories',
    'commitments',
    'commitment_payments',
    'charge_payments',
  ])('reads every %s row past the server cap, ordered by id', async (table) => {
    // A cap BELOW the page size: advancing by the page size would skip rows.
    serverMaxRows = 700;
    rows[table] = Array.from({ length: 2345 }, (_, i) => ({ id: `r${i}` }));

    const bundle = await exportUserData(USER_ID);
    const key = (
      {
        charges: 'charges',
        expenses: 'expenses',
        categories: 'categories',
        commitments: 'commitments',
        commitment_payments: 'commitmentPayments',
        charge_payments: 'chargePayments',
      } as const
    )[table as 'charges'];
    const got = bundle[key] as Array<{ id: string }>;
    expect(got).toHaveLength(2345);
    expect(new Set(got.map((r) => r.id)).size).toBe(2345);
    expect(orders.filter((o) => o.table === table).every((o) => o.column === 'id')).toBe(true);
  });
});

describe('export coverage of the schema', () => {
  it('names every table the migrations create — exported, or excluded with a reason', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations');
    const created = new Set<string>();
    const dropped = new Set<string>();
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(dir, file), 'utf8')
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n');
      for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi)) {
        created.add(m[1]!.toLowerCase());
      }
      for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?public\.(\w+)/gi)) {
        dropped.add(m[1]!.toLowerCase());
      }
    }
    const live = [...created].filter((t) => !dropped.has(t)).sort();

    // Sanity: the parser found the schema, not an empty folder.
    expect(live.length).toBeGreaterThanOrEqual(14);

    const accounted = new Set<string>([...EXPORTED_TABLES, ...Object.keys(TABLES_NOT_EXPORTED)]);
    const missing = live.filter((t) => !accounted.has(t));
    // The day a migration creates a table, this fails until someone decides
    // whether it belongs in the art. 20 export.
    expect(missing, `tables with no export decision: ${missing.join(', ')}`).toEqual([]);

    for (const [table, reason] of Object.entries(TABLES_NOT_EXPORTED)) {
      expect(reason.length, `${table} needs a written reason`).toBeGreaterThan(20);
    }
  });

  it('actually queries every table it declares as exported', async () => {
    rows.workspaces = [{ id: WS_A }];
    await exportUserData(USER_ID);
    const queried = new Set(selects.map((s) => s.table));
    expect([...EXPORTED_TABLES].filter((t) => !queried.has(t))).toEqual([]);
  });
});
