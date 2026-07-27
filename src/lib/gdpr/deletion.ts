import { createServiceRoleAdminClient, createServiceRoleClient } from '@/lib/supabase/admin';
import { logAuditEvent, AuditEvent } from '@/lib/security/audit-log';
import {
  claimPendingDeletionsWith,
  executeDeletionWith,
  type ClaimedDeletion,
} from '@/lib/gdpr/deletion-core';

/**
 * Right to erasure (RGPD art. 17) — hard delete after a 14-day grace period.
 *
 * This module is the `server-only` wrapper: it injects the privileged client
 * and owns the audit line. The orchestration itself lives in
 * `deletion-core.ts`, deliberately outside the marker so an end-to-end spec can
 * exercise the destructive path against a real schema (ADR-024 D5).
 *
 * ## The radius of destruction is authorship, not ownership
 *
 * `charges`, `expenses`, `categories`, `charge_payments`, `commitments` and
 * `commitment_payments` all carry `created_by … on delete cascade`;
 * `workspaces` carries `owner_id … on delete cascade`. **Deleting a person
 * destroys everything they created**, including inside a workspace they do not
 * own. In a shared workspace, art. 17 exercised by one member erases data for
 * the others. Theoretical only while every workspace has exactly one member —
 * which is a fact to re-measure, not to assume.
 *
 * ## What this does NOT erase — issue #278
 *
 * The cascade does **not** reach `auth.audit_log_entries`. That table keeps the
 * email in clear (`payload.actor_username`) and the IP, has no foreign key to
 * `auth.users`, and survives the erasure. `service_role` cannot even read it:
 * reaching the `auth` schema requires privileges no application client holds.
 * A measured art. 17 gap, tracked separately because closing it is its own
 * architectural decision. **It exists from the day the cron is armed, not
 * before.**
 *
 * Rows written with `userId: null` (rate-limit hits, password resets) carry an
 * IP and a user agent that `.eq('user_id', …)` can never reach, so they outlive
 * the erasure too. An IP is personal data.
 */

/**
 * 14 days, not 30 (ADR-023). At 30 the erasure landed on the exact edge of the
 * one-month legal deadline of art. 12(3): one failed run and we were late. The
 * shortened window ships WITH the executor and never before — publishing a
 * shorter promise with nothing to honour it would be worse than the status quo.
 */
const GRACE_PERIOD_DAYS = 14;

export async function requestDeletion(
  userId: string,
  reason?: string,
): Promise<{ scheduledFor: string }> {
  const supabase = createServiceRoleClient();
  const scheduledFor = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('deletion_requests').insert({
    user_id: userId,
    scheduled_for: scheduledFor,
    reason: reason?.slice(0, 500) ?? null,
    status: 'pending',
  });

  if (error) {
    // 23505 — `deletion_requests_one_active_idx`. The person already has a
    // request in flight; asking twice is not an error to show them, and
    // returning the NEW date would state a deadline the queue will not honour.
    // The existing one is the truth.
    if (error.code === '23505') {
      const { data } = await supabase
        .from('deletion_requests')
        .select('scheduled_for')
        .eq('user_id', userId)
        .in('status', ['pending', 'processing'])
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) return { scheduledFor: data.scheduled_for };
    }
    throw new Error(`Failed to schedule deletion: ${error.message}`);
  }

  // No audit call here on purpose. `requestAccountDeletionAction` already emits
  // GDPR_DELETION_REQUESTED, and it has the request IP and user-agent that this
  // module does not. Logging from both produced two rows per request, one of
  // them impoverished — invisible only while audit writes were being refused.
  return { scheduledFor };
}

export async function executeDeletion(userId: string): Promise<void> {
  // The unsealed client, because this is the one place that needs the GoTrue
  // admin API. Everything else in this file uses the sealed one.
  await executeDeletionWith(createServiceRoleAdminClient(), userId);

  // No `resource_id` here, deliberately. It carried the very UUID the steps
  // above just erased, so the account would be re-identifiable one row after
  // its deletion — jsonb metadata is not cascaded by `on delete set null`.
  // Same reasoning that removed `attempted_user_id` from the metadata
  // allow-list (see audit-log.ts).
  //
  // This call lives HERE and nowhere else: `deletion-core.ts` must stay free of
  // the audit dependency so the destructive path can be imported by a
  // Playwright spec.
  await logAuditEvent(
    AuditEvent.GDPR_DELETION_COMPLETED,
    { userId: null },
    {
      resource_type: 'user',
    },
  );
}

export async function claimPendingDeletions(batchSize: number): Promise<ClaimedDeletion[]> {
  return claimPendingDeletionsWith(createServiceRoleClient(), batchSize);
}

export type CancelDeletionResult =
  | { cancelled: true }
  | { cancelled: false; reason: 'in_progress' | 'none' };

/**
 * Cancel a pending request — and say honestly when there was nothing to cancel.
 *
 * The predecessor returned `void`, so a filter matching zero rows was
 * indistinguishable from a successful cancellation. The caller then emitted
 * `GDPR_DELETION_CANCELLED` regardless, writing an audit row asserting
 * something that had not happened. Once the queue is armed the distinction has
 * teeth: a row already `processing` is past the point of no return, and telling
 * the person otherwise is the same class of inexact statement (art. 12(1)) this
 * whole step exists to close.
 */
export async function cancelDeletion(userId: string): Promise<CancelDeletionResult> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('deletion_requests')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'pending')
    .select('id');

  if (error) throw new Error(`Failed to cancel deletion: ${error.message}`);
  if (data && data.length > 0) return { cancelled: true };

  // Nothing moved. Distinguish "too late" from "nothing was ever asked", so the
  // UI can say which, and so no audit row claims a cancellation that never
  // occurred.
  const { data: active } = await supabase
    .from('deletion_requests')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'processing')
    .limit(1)
    .maybeSingle();

  return { cancelled: false, reason: active ? 'in_progress' : 'none' };
}
