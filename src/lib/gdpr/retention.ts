import { createServiceRoleClient } from '@/lib/supabase/admin';

/**
 * Audit log retention — 12 months (art. 5(1)(e)).
 *
 * The SQL function has existed since April and **had no caller until this
 * module**. It was also `SECURITY DEFINER` on a table carrying
 * `FORCE ROW LEVEL SECURITY`, which means it could have deleted zero rows and
 * returned "success" — measured on 2026-07-27 with a purpose-built role lacking
 * `BYPASSRLS`: `rows_deleted = 0`, seven rows still there, no error raised.
 * PR-A (#282) moved it to `SECURITY INVOKER`; calling it as `service_role` was
 * then measured to delete for real (6 seeded, 6 returned, 0 left).
 *
 * So the privacy policy has promised a 12-month ceiling since April while
 * nothing enforced it. This is the line that makes the promise true.
 */
export async function purgeAuditLogOlderThan12Months(): Promise<number> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc('purge_audit_log_older_than_12_months');
  if (error) throw new Error(`Failed to purge audit log: ${error.message}`);

  // The function returns the row count. `null` would mean the call succeeded
  // but told us nothing — reported as zero rather than guessed at.
  return data ?? 0;
}
