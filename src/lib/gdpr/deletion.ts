import { createServiceRoleAdminClient, createServiceRoleClient } from '@/lib/supabase/admin';
import { logAuditEvent, AuditEvent } from '@/lib/security/audit-log';
import {
  claimPendingDeletionsWith,
  countDeletionQueueAlertsWith,
  executeDeletionWith,
  recordDeletionAttemptWith,
  type ClaimedDeletion,
  type DeletionErrorCode,
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

/**
 * Discriminated on purpose, and the caller MUST branch on `kind`.
 *
 * A `failed` row has no honourable deadline: it is in quarantine and will never
 * be claimed again. Returning its `scheduled_for` would be exactly what the
 * 23505 branch below exists to prevent — stating a date the queue will not
 * honour. The person is sent to the status screen instead, where *retry* waits.
 */
export type RequestDeletionResult =
  { kind: 'scheduled'; scheduledFor: string } | { kind: 'already_failed' };

export async function requestDeletion(
  userId: string,
  reason?: string,
): Promise<RequestDeletionResult> {
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
    //
    // `failed` is in the lookup because it is in the index (ADR-042 G7).
    // Without it this branch would find nothing and THROW, and the person could
    // never re-request their own erasure — a pure art. 17 blocker, caused by
    // the very status added to make failures visible.
    if (error.code === '23505') {
      const { data } = await supabase
        .from('deletion_requests')
        .select('scheduled_for, status')
        .eq('user_id', userId)
        .in('status', ['pending', 'processing', 'failed'])
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.status === 'failed') return { kind: 'already_failed' };
      if (data) return { kind: 'scheduled', scheduledFor: data.scheduled_for };
    }
    throw new Error(`Failed to schedule deletion: ${error.message}`);
  }

  // No audit call here on purpose. `requestAccountDeletionAction` already emits
  // GDPR_DELETION_REQUESTED, and it has the request IP and user-agent that this
  // module does not. Logging from both produced two rows per request, one of
  // them impoverished — invisible only while audit writes were being refused.
  return { kind: 'scheduled', scheduledFor };
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

/**
 * Date the attempt and say WHY it failed — on the row, at the verdict.
 *
 * Both columns are written here and nowhere else, in one statement, because
 * they mean the same thing at the same instant: *a real attempt happened, and
 * this is how it ended*. Writing `last_attempted_at` at claim time instead
 * would merely restate what `claimed_at` and `attempt_cycle_started_at` already
 * say, and would erase the distinction between a row claimed five times and a
 * row genuinely tried five times — the distinction the whole quarantine
 * conjunction is built on (ADR-042 G1).
 *
 * Only on FAILURE. A successful erasure takes the request row with it (ADR-024
 * D1: it cascades from `public.users`), so there is nothing left to annotate.
 *
 * Returns the number of rows touched, and the count is the point: this table
 * carries FORCE ROW LEVEL SECURITY, and a privileged write there can return
 * zero rows WITHOUT RAISING. A caller that ignores the count would be building
 * exactly the mute mechanism this whole change removes.
 */
export async function recordDeletionAttempt(
  requestId: string,
  errorCode: DeletionErrorCode,
): Promise<number> {
  return recordDeletionAttemptWith(createServiceRoleClient(), requestId, errorCode);
}

/**
 * How many rows are in quarantine right now — a number, and nothing else.
 *
 * `head: true` with `count: 'exact'` selects ZERO columns, so no identifier can
 * reach the response body this ends up in. Read AFTER the run, so it reflects
 * what the run left behind.
 */
export async function countStuckDeletions(): Promise<number> {
  const { stuck } = await countDeletionQueueAlertsWith(createServiceRoleClient());
  return stuck;
}

/**
 * How many requests are within five days of the legal deadline — whatever their
 * status, as long as they are not terminal.
 *
 * The width is a DEPENDENCY, not a comfort, and restricting it to `failed`
 * would silently re-open two blind spots:
 *
 *  - a `pending` row starved by influx (the named residual of the claim order)
 *    walks straight into non-compliance without ever becoming `failed`;
 *  - anyone relaunching every four days keeps their own row out of quarantine
 *    for ever, so a `failed`-only counter shows 0 while their erasure loops.
 *
 * `requested_at` never moves, so the art. 12(3) clock keeps running through all
 * of it. What we are watching is the BREACH, not one of its causes.
 *
 * 25 days = the one-month obligation minus the ~5-day quarantine window. Zero
 * columns selected: a number is all this returns.
 */
export async function countDeletionsNearBreach(): Promise<number> {
  const { nearBreach } = await countDeletionQueueAlertsWith(createServiceRoleClient());
  return nearBreach;
}

export type RetryDeletionResult = { retried: true } | { retried: false };

/**
 * Re-arm an erasure that gave up — the human gesture that replaces the
 * automatic retry loop refused in ADR-042 G3.
 *
 * It resets the attempt CYCLE, not the history: `attempts` returns to 0 and the
 * anchor to NULL, so the row is claimable again and its five-day clock starts
 * over. `scheduled_for` is deliberately untouched — it dates the original
 * request and the grace period has long since elapsed.
 *
 * The cross-cycle history is therefore NOT in this table any more: a row that
 * failed 4 + 4 + 4 times becomes indistinguishable from one that failed 4. That
 * history lives in the audit event the calling action emits, which is what
 * makes that event non-negotiable rather than decorative.
 *
 * Returns whether a row actually moved. Two tabs open, a claim in between, and
 * the relaunch lands on a row that is no longer `failed` — an issue that
 * changed nothing must never present as a success.
 */
export async function retryDeletion(userId: string): Promise<RetryDeletionResult> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('deletion_requests')
    .update({
      status: 'pending',
      attempts: 0,
      attempt_cycle_started_at: null,
      retried_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('status', 'failed')
    .select('id');

  if (error) throw new Error(`Failed to retry deletion: ${error.message}`);
  return { retried: (data?.length ?? 0) > 0 };
}

export type CancelDeletionResult =
  { cancelled: true } | { cancelled: false; reason: 'in_progress' | 'none' };

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
    // BOTH exits from the screen's point of view. Filtering `pending` alone
    // made this a lie the day `failed` appeared: on a quarantined row the
    // update touched nothing, `reason: 'none'` was not treated as an error, and
    // the button announced "request cancelled" while the screen still showed
    // the failure. The button is offered exactly where it can work.
    .in('status', ['pending', 'failed'])
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
