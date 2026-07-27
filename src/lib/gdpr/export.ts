import { createServiceRoleClient } from '@/lib/supabase/admin';
import { logAuditEvent, AuditEvent } from '@/lib/security/audit-log';

/**
 * Right to data portability (RGPD art. 20).
 *
 * Produces a JSON bundle of SEVEN of the fourteen tables. It is NOT "every row
 * the user owns", whatever this comment used to say — `commitments`,
 * `commitment_payments` (the user's debts), `accounts` (their balances),
 * `charge_payments`, `workspace_settings`, `workspace_members` and
 * `deletion_requests` are all absent. The public copy was corrected to match;
 * do not let this comment drift back and justify re-inflating the claim.
 *
 * Service role required — RLS would otherwise scope reads to the caller's
 * session, and it no longer backstops an unscoped query. Every statement below
 * must filter on `userId`, asserted by column name in `__tests__/export.test.ts`.
 */
export type UserDataExport = {
  schemaVersion: '1.0';
  exportedAt: string;
  user: Record<string, unknown>;
  workspaces: Array<Record<string, unknown>>;
  charges: Array<Record<string, unknown>>;
  expenses: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  consents: Array<Record<string, unknown>>;
  auditLog: Array<Record<string, unknown>>;
};

export async function exportUserData(userId: string): Promise<UserDataExport> {
  const supabase = createServiceRoleClient();

  const [userRes, workspacesRes, chargesRes, expensesRes, categoriesRes, consentsRes, auditRes] =
    await Promise.all([
      supabase.from('users').select('*').eq('id', userId).single(),
      supabase.from('workspaces').select('*').eq('owner_id', userId),
      supabase.from('charges').select('*').eq('created_by', userId),
      supabase.from('expenses').select('*').eq('created_by', userId),
      supabase.from('categories').select('*').eq('created_by', userId),
      supabase.from('user_consents').select('*').eq('user_id', userId),
      // `order` before `limit` is not cosmetic: without it PostgREST returns
      // rows in physical order, so a user past 1000 events would receive an
      // arbitrary subset of their audit trail with no indication of it. The cap
      // was theoretical while audit writes were being refused; from this commit
      // every financial gesture writes a row.
      supabase
        .from('audit_log')
        .select('*')
        .eq('user_id', userId)
        .order('occurred_at', { ascending: false })
        .limit(1000),
    ]);

  const bundle: UserDataExport = {
    schemaVersion: '1.0',
    exportedAt: new Date().toISOString(),
    user: (userRes.data ?? {}) as Record<string, unknown>,
    workspaces: (workspacesRes.data ?? []) as Array<Record<string, unknown>>,
    charges: (chargesRes.data ?? []) as Array<Record<string, unknown>>,
    expenses: (expensesRes.data ?? []) as Array<Record<string, unknown>>,
    categories: (categoriesRes.data ?? []) as Array<Record<string, unknown>>,
    consents: (consentsRes.data ?? []) as Array<Record<string, unknown>>,
    auditLog: (auditRes.data ?? []) as Array<Record<string, unknown>>,
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
