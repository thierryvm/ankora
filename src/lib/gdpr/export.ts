import { createAdminClient } from '@/lib/supabase/server';
import { logAuditEvent, AuditEvent } from '@/lib/security/audit-log';

/**
 * Right to data portability (RGPD art. 20).
 * Produces a self-contained JSON bundle of every row the user owns.
 * Service role required — RLS would otherwise scope reads to the caller's session.
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
  const supabase = await createAdminClient();

  const [userRes, workspacesRes, chargesRes, expensesRes, categoriesRes, consentsRes, auditRes] =
    await Promise.all([
      supabase.from('users').select('*').eq('id', userId).single(),
      supabase.from('workspaces').select('*').eq('owner_id', userId),
      supabase.from('charges').select('*').eq('created_by', userId),
      supabase.from('expenses').select('*').eq('created_by', userId),
      supabase.from('categories').select('*').eq('created_by', userId),
      supabase.from('user_consents').select('*').eq('user_id', userId),
      supabase.from('audit_log').select('*').eq('user_id', userId).limit(1000),
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
