import { createAdminClient } from '@/lib/supabase/server';
import { logAuditEvent, AuditEvent } from '@/lib/security/audit-log';

/**
 * Right to erasure (RGPD art. 17) — hard delete after 30-day grace period.
 * Deletion cascades via FK constraints: workspaces → charges/expenses/categories.
 * Audit log rows are pseudonymised (user_id set to NULL) rather than deleted,
 * to preserve security trail integrity per art. 17(3)(b)+(e).
 */

export async function requestDeletion(
  userId: string,
  reason?: string,
): Promise<{ scheduledFor: string }> {
  const supabase = await createAdminClient();
  const scheduledFor = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('deletion_requests').insert({
    user_id: userId,
    scheduled_for: scheduledFor,
    reason: reason?.slice(0, 500) ?? null,
    status: 'pending',
  });

  if (error) throw new Error(`Failed to schedule deletion: ${error.message}`);

  await logAuditEvent(
    AuditEvent.GDPR_DELETION_REQUESTED,
    { userId },
    {
      resource_type: 'deletion_request',
      reason: 'user_request',
    },
  );

  return { scheduledFor };
}

export async function executeDeletion(userId: string): Promise<void> {
  const supabase = await createAdminClient();

  // Pseudonymise audit log (keep security trail, drop identity)
  await supabase
    .from('audit_log')
    .update({ user_id: null, ip_address: null, user_agent: null })
    .eq('user_id', userId);

  // Cascade will handle workspaces → charges/expenses/categories/consents
  const { error: deleteWorkspaces } = await supabase
    .from('workspaces')
    .delete()
    .eq('owner_id', userId);
  if (deleteWorkspaces) throw new Error(`Failed to delete workspaces: ${deleteWorkspaces.message}`);

  const { error: deleteUser } = await supabase.auth.admin.deleteUser(userId);
  if (deleteUser) throw new Error(`Failed to delete auth user: ${deleteUser.message}`);

  await logAuditEvent(
    AuditEvent.GDPR_DELETION_COMPLETED,
    { userId: null },
    {
      resource_type: 'user',
      resource_id: userId,
    },
  );
}

export async function cancelDeletion(userId: string): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('deletion_requests')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'pending');

  if (error) throw new Error(`Failed to cancel deletion: ${error.message}`);
}
