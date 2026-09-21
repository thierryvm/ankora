import { createServiceRoleClient } from '@/lib/supabase/admin';
import { logAuditEvent, AuditEvent } from '@/lib/security/audit-log';

/**
 * Right to data portability (RGPD art. 20).
 *
 * Produces a JSON bundle of every table of `public` that holds data about the
 * requesting person — all fourteen the migrations create, as of this commit.
 * `__tests__/export.test.ts` parses `supabase/migrations/` and fails the day a
 * table is born without a decision here: exported (`EXPORTED_TABLES`) or left
 * out with its written reason (`TABLES_NOT_EXPORTED`).
 *
 * How each table is scoped — the service role bypasses RLS, so these filters
 * are the ONLY thing between an export and someone else's rows:
 *
 * - by the person's id: `users.id`, `workspaces.owner_id`, `created_by` on
 *   charges, expenses, categories, commitments, charge_payments and
 *   commitment_payments, `user_id` on user_consents, audit_log,
 *   workspace_members and deletion_requests;
 * - by the workspaces the person OWNS (ids taken from the owner-scoped read
 *   above, never from the caller): accounts and workspace_settings, which have
 *   no user column.
 *
 * Two tables are read with an explicit column list rather than `*`:
 * `workspace_members` (the person's own membership rows only — a co-member's
 * id is not the exporter's data) and `deletion_requests` (the queue's worker
 * columns describe our infrastructure, not the person).
 *
 * Format: 1.0 → 1.1 added keys and renamed none, so a reader of a 1.0 file
 * reads a 1.1 file unchanged.
 */
export type UserDataExport = {
  schemaVersion: '1.2';
  exportedAt: string;
  user: Record<string, unknown>;
  workspaces: Array<Record<string, unknown>>;
  charges: Array<Record<string, unknown>>;
  expenses: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  consents: Array<Record<string, unknown>>;
  auditLog: Array<Record<string, unknown>>;
  // 1.1
  accounts: Array<Record<string, unknown>>;
  workspaceSettings: Array<Record<string, unknown>>;
  commitments: Array<Record<string, unknown>>;
  commitmentPayments: Array<Record<string, unknown>>;
  chargePayments: Array<Record<string, unknown>>;
  workspaceMemberships: Array<Record<string, unknown>>;
  deletionRequests: Array<Record<string, unknown>>;
  // 1.2 — le journal J2. Une opération ANNULÉE reste exportée : elle est une
  // donnée de la personne, et son annulation en fait partie (ADR-045 D15).
  movements: Array<Record<string, unknown>>;
  accountBalanceStatements: Array<Record<string, unknown>>;
};

/** Every `public` table this export reads. */
export const EXPORTED_TABLES = [
  'users',
  'workspaces',
  'charges',
  'expenses',
  'categories',
  'user_consents',
  'audit_log',
  'accounts',
  'workspace_settings',
  'commitments',
  'commitment_payments',
  'charge_payments',
  'workspace_members',
  'deletion_requests',
  'movements',
  'account_balance_statements',
] as const;

/**
 * Tables deliberately left out, each with its reason. Empty today: every table
 * of the schema holds data about the person. A table added here must say why
 * its rows are not the person's data — "not needed" is not a reason.
 */
export const TABLES_NOT_EXPORTED: Readonly<Record<string, string>> = {};

const WORKSPACE_MEMBER_COLUMNS = 'workspace_id, role, joined_at';
// `retried_at` is the person's own gesture (relaunching their erasure); the
// other queue columns (claimed_at, attempts, last_*) describe our worker.
const DELETION_REQUEST_COLUMNS =
  'requested_at, scheduled_for, status, reason, cancelled_at, completed_at, retried_at';

type Rows = Array<Record<string, unknown>>;
type Result = { data: unknown; error: { message: string; code?: string } | null };

/**
 * A failed read throws. The previous `data ?? []` turned an error into an
 * empty list, inside a file the UI presents as complete. The message names
 * the table only; the PostgREST error travels as `cause`, never to the client.
 */
function rowsOf(table: string, res: Result): Rows {
  if (res.error) throw new Error(`GDPR export: reading ${table} failed`, { cause: res.error });
  return (res.data ?? []) as Rows;
}

/**
 * PostgREST cuts every response at `max_rows` (1000 in `supabase/config.toml`)
 * WITHOUT an error. A user with 1 200 expenses would receive 1 000 of them, in
 * no guaranteed order, in a file called complete. So the per-person tables are
 * read page by page under a total order, advancing by the rows actually
 * received and stopping on an empty page — correct whatever the server's cap
 * is. No table of this export carries a limit: none may be truncated.
 */
const PAGE_SIZE = 1000;

/**
 * Walks one table page by page until a page comes back empty. The caller gives
 * the query for a given offset; every page must carry the SAME total order, or
 * rows shift between pages and the walk skips or repeats them.
 */
async function readAllPages(page: (from: number) => PromiseLike<Result>): Promise<Result> {
  const all: Rows = [];
  for (let from = 0; ;) {
    const res = await page(from);
    if (res.error) return res;
    const received = (res.data ?? []) as Rows;
    if (received.length === 0) return { data: all, error: null };
    all.push(...received);
    from += received.length;
  }
}

export async function exportUserData(userId: string): Promise<UserDataExport> {
  const supabase = createServiceRoleClient();

  type PagedTable =
    | 'charges'
    | 'expenses'
    | 'categories'
    | 'commitments'
    | 'commitment_payments'
    | 'charge_payments'
    | 'movements'
    | 'account_balance_statements';

  const readAllCreatedBy = (table: PagedTable): Promise<Result> =>
    readAllPages((from) =>
      supabase
        .from(table)
        .select('*')
        .eq('created_by', userId)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1),
    );

  /**
   * The audit trail used to stop at 1 000 rows. Every financial gesture writes
   * one, so an active person crosses that in under a year and would receive a
   * truncated trail inside a file art. 20 presents as complete — the same
   * silent cut the six tables above were fixed for.
   *
   * Newest first, because that is the order the trail is read in; `id` after
   * it because `occurred_at` alone is not a total order (two events in the
   * same instant could straddle a page boundary and be skipped or doubled).
   */
  const readAllAudit = (): Promise<Result> =>
    readAllPages((from) =>
      supabase
        .from('audit_log')
        .select('*')
        .eq('user_id', userId)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1),
    );

  const workspacesRes = await supabase.from('workspaces').select('*').eq('owner_id', userId);
  const workspaces = rowsOf('workspaces', workspacesRes);
  const ownedIds = workspaces.map((w) => w.id).filter((id): id is string => typeof id === 'string');

  // An `in` on an empty list is not issued at all: owning no workspace means
  // there is nothing workspace-scoped to export.
  const byOwnedWorkspace = (table: 'accounts' | 'workspace_settings') =>
    ownedIds.length === 0
      ? Promise.resolve<Result>({ data: [], error: null })
      : supabase.from(table).select('*').in('workspace_id', ownedIds);

  const [
    userRes,
    chargesRes,
    expensesRes,
    categoriesRes,
    consentsRes,
    auditRes,
    accountsRes,
    settingsRes,
    commitmentsRes,
    commitmentPaymentsRes,
    chargePaymentsRes,
    membershipsRes,
    deletionRes,
    movementsRes,
    statementsRes,
  ] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).single(),
    readAllCreatedBy('charges'),
    readAllCreatedBy('expenses'),
    readAllCreatedBy('categories'),
    supabase.from('user_consents').select('*').eq('user_id', userId),
    readAllAudit(),
    byOwnedWorkspace('accounts'),
    byOwnedWorkspace('workspace_settings'),
    readAllCreatedBy('commitments'),
    readAllCreatedBy('commitment_payments'),
    readAllCreatedBy('charge_payments'),
    supabase.from('workspace_members').select(WORKSPACE_MEMBER_COLUMNS).eq('user_id', userId),
    supabase.from('deletion_requests').select(DELETION_REQUEST_COLUMNS).eq('user_id', userId),
    readAllCreatedBy('movements'),
    readAllCreatedBy('account_balance_statements'),
  ]);

  if (userRes.error) throw new Error('GDPR export: reading users failed', { cause: userRes.error });

  const bundle: UserDataExport = {
    schemaVersion: '1.2',
    exportedAt: new Date().toISOString(),
    user: (userRes.data ?? {}) as Record<string, unknown>,
    workspaces,
    charges: rowsOf('charges', chargesRes),
    expenses: rowsOf('expenses', expensesRes),
    categories: rowsOf('categories', categoriesRes),
    consents: rowsOf('user_consents', consentsRes),
    auditLog: rowsOf('audit_log', auditRes),
    accounts: rowsOf('accounts', accountsRes),
    workspaceSettings: rowsOf('workspace_settings', settingsRes),
    commitments: rowsOf('commitments', commitmentsRes),
    commitmentPayments: rowsOf('commitment_payments', commitmentPaymentsRes),
    chargePayments: rowsOf('charge_payments', chargePaymentsRes),
    workspaceMemberships: rowsOf('workspace_members', membershipsRes),
    deletionRequests: rowsOf('deletion_requests', deletionRes),
    movements: rowsOf('movements', movementsRes),
    accountBalanceStatements: rowsOf('account_balance_statements', statementsRes),
  };

  await logAuditEvent(
    AuditEvent.GDPR_EXPORT_COMPLETED,
    { userId },
    {
      resource_type: 'data_export',
      count: bundle.charges.length + bundle.expenses.length,
    },
  );

  return bundle;
}
