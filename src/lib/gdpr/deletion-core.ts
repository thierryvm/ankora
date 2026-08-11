import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

/**
 * The destructive orchestration, deliberately WITHOUT `import 'server-only'`.
 *
 * `@/lib/supabase/admin` carries that marker, and Next's copy of it throws
 * unconditionally when evaluated outside a server bundle. Vitest aliases it
 * away; **Playwright does not**. So as long as this code lived behind the
 * marker, an end-to-end spec could not import the one irreversible path in the
 * system, and it was proven nowhere against a real schema.
 *
 * Everything here takes the Supabase client as a parameter. `deletion.ts`
 * stays the `server-only` wrapper that injects the privileged client and owns
 * the audit line. The guard is not weakened: `npm run lint:use-server` still
 * refuses any `'use client'` module that imports the wrapper, and no key can
 * reach a browser bundle — Next never inlines a non-`NEXT_PUBLIC_*` variable.
 *
 * See ADR-024 D5.
 */

export type DeletionClient = SupabaseClient<Database>;

export type ClaimedDeletion = {
  requestId: string;
  userId: string;
};

/**
 * The closed vocabulary persisted in `deletion_requests.last_error_code`.
 *
 * `not_attempted` is written by the SQL claim, never from here: it marks a row
 * that was claimed without a single call ever going out.
 */
export type DeletionErrorCode = 'gotrue_error' | 'pseudonymise_error' | 'unknown';

/**
 * A failure that knows WHICH step failed — and the distinction is not cosmetic.
 *
 * Both steps used to throw a bare `Error` with an interpolated message, so the
 * caller could not tell them apart without a regular expression over that
 * message — a shortcut the global CLAUDE.md files under "making it pass".
 * Collapsing both under `unknown` was the other tempting option, and it is the
 * one that loses the information that matters to the person: if the
 * pseudonymisation failed, NOTHING was destroyed; if GoTrue failed after it,
 * their audit trail is already anonymised for good (ADR-042 G5, named
 * residual). The code says how much of an explanation we owe them.
 *
 * The message stays out of the database on purpose (ADR-042 G8): a raw GoTrue
 * message can embed an email address, and the row is readable by the person.
 */
export class DeletionStepError extends Error {
  readonly code: Exclude<DeletionErrorCode, 'unknown'>;

  constructor(code: Exclude<DeletionErrorCode, 'unknown'>, message: string) {
    super(message);
    this.name = 'DeletionStepError';
    this.code = code;
    // Restores the prototype chain when the class is transpiled down; without
    // it `instanceof` silently returns false and every failure reads `unknown`.
    Object.setPrototypeOf(this, DeletionStepError.prototype);
  }
}

/**
 * Read the code off whatever was thrown, falling back to `unknown`.
 *
 * Deliberately total: anything that is not one of our two typed failures — a
 * network throw, a PostgREST timeout, a bug — is `unknown` rather than
 * something guessed from its text.
 */
export function deletionErrorCode(error: unknown): DeletionErrorCode {
  return error instanceof DeletionStepError ? error.code : 'unknown';
}

/**
 * Drop identity from the security trail, keep the trail (art. 17(3)(b)+(e)).
 *
 * Returns the number of rows touched. **Zero is a success**, and the count is
 * returned rather than asserted for a measured reason: a legitimate account may
 * simply have no audit events. Requiring `count > 0` would freeze the queue for
 * exactly those accounts — the silent-failure class this whole step removes.
 * Only an `error` stops the caller.
 *
 * Idempotent by construction: a second pass matches nothing.
 */
export async function pseudonymiseAuditLog(
  client: DeletionClient,
  userId: string,
): Promise<number> {
  const { error, count } = await client
    .from('audit_log')
    .update({ user_id: null, ip_address: null, user_agent: null }, { count: 'exact' })
    .eq('user_id', userId);

  if (error) {
    throw new DeletionStepError(
      'pseudonymise_error',
      `Failed to pseudonymise audit log: ${error.message}`,
    );
  }
  return count ?? 0;
}

/**
 * A GoTrue deletion that reports "user not found" is a SUCCESS.
 *
 * Without this, any row whose user vanished by another path (a manual delete, a
 * cascade, a previous run whose response was lost) becomes a poison pill:
 * claimed and failed every single day, forever. ADR-024 D1.
 */
function isAlreadyGone(error: { status?: number; message: string }): boolean {
  return error.status === 404 || /user not found/i.test(error.message);
}

/**
 * Erase one account. Two steps, of which **only the second is irreversible**.
 *
 * Order is forced and cannot be swapped: `audit_log.user_id` is
 * `on delete set null` (20260416000001:145), so after the auth user is gone
 * those rows can no longer be found by user id.
 *
 * A crash between the two leaves an anonymised trail on a live account. The row
 * returns to `pending`, step 1 replays touching zero rows, step 2 completes.
 * The worst case degrades the audit trail — not the person's data — and repairs
 * itself. That is the whole reason this design needs no atomicity, which is
 * unreachable anyway: `service_role` has no privilege on the `auth` schema, so
 * the account deletion MUST cross from PostgREST to GoTrue.
 *
 * Returns the pseudonymised row count so callers can report it.
 */
export async function executeDeletionWith(
  client: DeletionClient,
  userId: string,
): Promise<{ pseudonymisedRows: number }> {
  const pseudonymisedRows = await pseudonymiseAuditLog(client, userId);

  // No `delete from workspaces` here. It was measurably redundant — the
  // cascade from `public.users` covers it (`workspaces.owner_id … on delete
  // cascade`, 20260416000001:26) — and every redundant statement is one more
  // way to half-fail.
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error && !isAlreadyGone(error)) {
    throw new DeletionStepError('gotrue_error', `Failed to delete auth user: ${error.message}`);
  }

  return { pseudonymisedRows };
}

/**
 * Date the attempt and say which step failed — on the row, at the verdict.
 *
 * Outside the `server-only` marker for the same reason as everything else here:
 * `deletion_requests` carries FORCE ROW LEVEL SECURITY, and a privileged write
 * on such a table can touch ZERO ROWS WITHOUT RAISING. That is not something a
 * mock can tell us — only a write against the real schema can, and only
 * Playwright can perform one. `deletion.ts` stays the wrapper that injects the
 * client.
 *
 * Returns the number of rows touched, and the caller is expected to look: an
 * attempt counter that silently stops being written is the exact mute failure
 * this whole mechanism exists to remove.
 */
export async function recordDeletionAttemptWith(
  client: DeletionClient,
  requestId: string,
  errorCode: DeletionErrorCode,
): Promise<number> {
  const { data, error } = await client
    .from('deletion_requests')
    .update({ last_attempted_at: new Date().toISOString(), last_error_code: errorCode })
    .eq('id', requestId)
    .select('id');

  if (error) throw new Error(`Failed to record deletion attempt: ${error.message}`);
  return data?.length ?? 0;
}

/**
 * The two numbers the admin panel shows, and the only two it may show.
 *
 * Outside the marker for the same measured reason as the write above:
 * `deletion_requests` is `FORCE ROW LEVEL SECURITY` with self-only policies, so
 * a privileged READ there is exactly as capable of quietly returning nothing as
 * a privileged write is of touching nothing. A founder-only screen showing a
 * confident `0` because the read was refused is the mute alarm this whole
 * change is about, and only a query against the real schema can rule it out.
 *
 * SEALED: `count: 'exact', head: true` selects ZERO columns, so no identifier
 * can reach the page — not a user id, not an email, not a request id.
 *
 * `nearBreach` covers EVERY non-terminal request older than 25 days, not just
 * the quarantined ones. A request starved by influx never becomes `failed`, and
 * anyone relaunching their own erasure every four days keeps it out of
 * quarantine indefinitely — in both cases a `failed`-only count reads 0 while
 * the art. 12(3) clock runs. It is the breach being watched, not one cause.
 */
export async function countDeletionQueueAlertsWith(
  client: DeletionClient,
): Promise<{ stuck: number; nearBreach: number }> {
  const cutoff = new Date(Date.now() - NEAR_BREACH_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [stuckRes, nearRes] = await Promise.all([
    client
      .from('deletion_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed'),
    client
      .from('deletion_requests')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'processing', 'failed'])
      .lt('requested_at', cutoff),
  ]);

  if (stuckRes.error) throw new Error(`Failed to count stuck deletions: ${stuckRes.error.message}`);
  if (nearRes.error) {
    throw new Error(`Failed to count deletions near breach: ${nearRes.error.message}`);
  }

  return { stuck: stuckRes.count ?? 0, nearBreach: nearRes.count ?? 0 };
}

/**
 * One month of legal obligation minus the ~5 days a request spends reaching
 * quarantine — i.e. the point past which someone must look.
 */
const NEAR_BREACH_DAYS = 25;

/**
 * Take ownership of the due requests, and re-queue whatever a previous run left
 * stranded in `processing`. Both happen inside the SQL function, in one
 * transaction — see `supabase/migrations/20260727000001_deletion_queue.sql`.
 */
export async function claimPendingDeletionsWith(
  client: DeletionClient,
  batchSize: number,
): Promise<ClaimedDeletion[]> {
  const { data, error } = await client.rpc('claim_pending_deletions', {
    batch_size: batchSize,
  });

  if (error) throw new Error(`Failed to claim pending deletions: ${error.message}`);

  return (data ?? []).map((row) => ({
    requestId: row.request_id,
    userId: row.target_user_id,
  }));
}
