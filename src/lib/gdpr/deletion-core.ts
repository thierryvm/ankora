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

  if (error) throw new Error(`Failed to pseudonymise audit log: ${error.message}`);
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
    throw new Error(`Failed to delete auth user: ${error.message}`);
  }

  return { pseudonymisedRows };
}

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
