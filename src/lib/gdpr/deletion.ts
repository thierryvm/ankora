import { createServiceRoleAdminClient, createServiceRoleClient } from '@/lib/supabase/admin';
import { logAuditEvent, AuditEvent } from '@/lib/security/audit-log';

/**
 * Right to erasure (RGPD art. 17) — hard delete after 30-day grace period.
 * Deletion cascades via FK constraints: workspaces → charges/expenses/categories.
 * Audit log rows are pseudonymised (user_id set to NULL) rather than deleted,
 * to preserve security trail integrity per art. 17(3)(b)+(e).
 *
 * Two known limits, both tracked for the step that wires `executeDeletion` to a
 * cron (it has no caller today):
 *   - Rows written with `userId: null` (rate-limit hits, password resets) carry
 *     an IP and user agent that `.eq('user_id', …)` can never reach, so they
 *     outlive the erasure. An IP is personal data.
 *   - The three statements below are not one transaction. A failure after the
 *     pseudonymisation leaves a live account whose audit trail is already
 *     anonymised. The order is nonetheless forced: deleting the auth user first
 *     would null `user_id` and make those rows unreachable.
 */

export async function requestDeletion(
  userId: string,
  reason?: string,
): Promise<{ scheduledFor: string }> {
  const supabase = createServiceRoleClient();
  const scheduledFor = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('deletion_requests').insert({
    user_id: userId,
    scheduled_for: scheduledFor,
    reason: reason?.slice(0, 500) ?? null,
    status: 'pending',
  });

  if (error) throw new Error(`Failed to schedule deletion: ${error.message}`);

  // No audit call here on purpose. `requestAccountDeletionAction` already emits
  // GDPR_DELETION_REQUESTED, and it has the request IP and user-agent that this
  // module does not. Logging from both produced two rows per request, one of
  // them impoverished — invisible only while audit writes were being refused.
  return { scheduledFor };
}

export async function executeDeletion(userId: string): Promise<void> {
  // The unsealed client, because this is the one place that needs the GoTrue
  // admin API. Everything else in this file uses the sealed one.
  const supabase = createServiceRoleAdminClient();

  // Pseudonymise audit log (keep security trail, drop identity).
  // The result MUST be checked: this used to be fire-and-forget, so a refusal
  // left identifying rows in place while the rest of the deletion carried on.
  const { error: pseudonymise } = await supabase
    .from('audit_log')
    .update({ user_id: null, ip_address: null, user_agent: null })
    .eq('user_id', userId);
  if (pseudonymise) {
    throw new Error(`Failed to pseudonymise audit log: ${pseudonymise.message}`);
  }

  // Cascade handles workspaces → charges/expenses/categories. `user_consents`
  // and `deletion_requests` do NOT descend from workspaces — they cascade from
  // `users`, via the auth deletion below.
  const { error: deleteWorkspaces } = await supabase
    .from('workspaces')
    .delete()
    .eq('owner_id', userId);
  if (deleteWorkspaces) throw new Error(`Failed to delete workspaces: ${deleteWorkspaces.message}`);

  const { error: deleteUser } = await supabase.auth.admin.deleteUser(userId);
  if (deleteUser) throw new Error(`Failed to delete auth user: ${deleteUser.message}`);

  // No `resource_id` here, deliberately. It carried the very UUID the two
  // statements above just erased, so the account would be re-identifiable one
  // row after its deletion — jsonb metadata is not cascaded by
  // `on delete set null`. Same reasoning that removed `attempted_user_id` from
  // the metadata allow-list (see audit-log.ts).
  await logAuditEvent(
    AuditEvent.GDPR_DELETION_COMPLETED,
    { userId: null },
    {
      resource_type: 'user',
    },
  );
}

export async function cancelDeletion(userId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from('deletion_requests')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'pending');

  if (error) throw new Error(`Failed to cancel deletion: ${error.message}`);
}
