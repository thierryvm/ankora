import { createClient } from '@supabase/supabase-js';

import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';
import { claimPendingDeletionsWith, executeDeletionWith } from '@/lib/gdpr/deletion-core';

/**
 * The only place the destructive path is exercised against a real schema.
 *
 * It exists because of ADR-024 D5: `src/lib/gdpr/deletion.ts` imports
 * `@/lib/supabase/admin`, which carries `import 'server-only'` — a module that
 * throws unconditionally, and that Vitest aliases away but Playwright does not.
 * Measured on this repo before the extraction: importing the wrapper here fails
 * at collection time with `server-only/index.js:1`. Importing `deletion-core`
 * succeeds. That difference is the whole point of the extraction.
 *
 * ## Why this refuses anything but a local Supabase
 *
 * `claim_pending_deletions()` is NOT scoped to a user, by design: it claims
 * every due row in the table. `test.skip(!admin, …)` is not enough of a guard —
 * `adminClientOrNull()` returns a usable client as soon as the key is 40+
 * characters, and the PUBLIC e2e job wires
 * `SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.E2E_SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role' }}`
 * (ci.yml:79). The day that secret exists, this spec would run against whatever
 * it points at. The host check below is what makes that impossible.
 *
 * It is also what makes "a second claim returns nothing" deterministic: on any
 * database holding other due rows, that assertion is simply false.
 */

const admin = adminClientOrNull();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
/**
 * Parsed, not pattern-matched. A regex over the raw string is bypassable
 * through the userinfo part — measured:
 *
 *   http://127.0.0.1:5442@fkscfvoouwufyjwnfvhb.supabase.co
 *     regex says local · real host is fkscfvoouwufyjwnfvhb.supabase.co
 *
 * The `:` of the port makes the pattern accept everything before the `@`. This
 * is the guard standing between a spec that calls an UNSCOPED
 * `claimPendingDeletionsWith(admin, 100)` and a production database, so it
 * resolves the host the same way the client will.
 */
const isLocalSupabase = (() => {
  try {
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(SUPABASE_URL).hostname);
  } catch {
    return false;
  }
})();

const AUDIT_EVENT = 'test.deletion_queue';

function isoIn(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

test.describe('GDPR deletion queue (ADR-024)', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');
  test.skip(
    !isLocalSupabase,
    `Refuses to run against a non-local Supabase (${SUPABASE_URL || 'unset'}): ` +
      'claim_pending_deletions() claims EVERY due row in the table, not just this test’s.',
  );

  test('erases the account and leaves an audit trail stripped of identity', async () => {
    if (!admin) return;

    const user = await seedOnboardedUser(admin, [
      { label: 'Loyer', amount: 800, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
    ]);

    const rowsFor = async (table: string, column: string, value: string): Promise<number> => {
      const { count, error } = await admin
        .from(table as 'charges')
        .select('*', { count: 'exact', head: true })
        .eq(column, value);
      if (error) throw new Error(`count ${table}.${column}: ${error.message}`);
      return count ?? 0;
    };

    // Two audit rows carrying the three columns pseudonymisation must clear.
    // Their ids are captured NOW: after the erasure `user_id` is null and there
    // is no other way to find them again.
    const { data: seededAudit, error: auditError } = await admin
      .from('audit_log')
      .insert([
        {
          event_type: AUDIT_EVENT,
          user_id: user.userId,
          ip_address: '203.0.113.7',
          user_agent: 'ankora-e2e',
        },
        {
          event_type: AUDIT_EVENT,
          user_id: user.userId,
          ip_address: '198.51.100.4',
          user_agent: 'ankora-e2e',
        },
      ])
      .select('id');
    if (auditError) throw new Error(`seed audit rows: ${auditError.message}`);
    const auditIds = (seededAudit ?? []).map((row) => row.id);
    expect(auditIds).toHaveLength(2);

    await admin
      .from('deletion_requests')
      .insert({ user_id: user.userId, scheduled_for: isoIn(-1), status: 'pending' });

    // Exact counts before — a "0 after" proves nothing without them.
    expect(await rowsFor('charges', 'created_by', user.userId)).toBe(1);
    expect(await rowsFor('workspaces', 'owner_id', user.userId)).toBe(1);
    expect(await rowsFor('workspace_members', 'user_id', user.userId)).toBe(1);
    expect(await rowsFor('users', 'id', user.userId)).toBe(1);
    expect(await rowsFor('deletion_requests', 'user_id', user.userId)).toBe(1);

    try {
      const { pseudonymisedRows } = await executeDeletionWith(admin, user.userId);
      expect(pseudonymisedRows).toBe(2);

      expect(await rowsFor('charges', 'created_by', user.userId)).toBe(0);
      expect(await rowsFor('workspaces', 'owner_id', user.userId)).toBe(0);
      expect(await rowsFor('workspace_members', 'user_id', user.userId)).toBe(0);
      expect(await rowsFor('users', 'id', user.userId)).toBe(0);
      // ADR-024 D1: the request row cascades away with the account, which is why
      // `status='completed'` is unreachable and nothing will ever write it.
      expect(await rowsFor('deletion_requests', 'user_id', user.userId)).toBe(0);

      const { data: after } = await admin
        .from('audit_log')
        .select('id, user_id, ip_address, user_agent')
        .in('id', auditIds);

      // The trail SURVIVES (art. 17(3)(b)+(e)) — it is not deleted with the
      // account.
      expect(after ?? []).toHaveLength(2);
      for (const row of after ?? []) {
        // `user_id` alone would prove nothing: `on delete set null` clears it
        // as a side effect of the cascade. The IP and the user agent are
        // cleared by NOTHING but the pseudonymisation, so they are what
        // distinguishes "we scrubbed" from "the FK did it for us".
        expect(row.user_id).toBeNull();
        expect(row.ip_address).toBeNull();
        expect(row.user_agent).toBeNull();
      }
    } finally {
      await admin.from('audit_log').delete().in('id', auditIds);
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('a second erasure of the same account is a no-op, not a failure', async () => {
    if (!admin) return;

    const user = await seedOnboardedUser(admin);
    await deleteSeededUser(admin, user.userId);

    // GoTrue answers "user not found". Treating that as an error would make the
    // row a poison pill: claimed and failed every day, forever (ADR-024 D1).
    await expect(executeDeletionWith(admin, user.userId)).resolves.toEqual({
      pseudonymisedRows: 0,
    });
  });

  test('claims what is due, ignores what is not, and never claims twice', async () => {
    if (!admin) return;

    const due = await seedOnboardedUser(admin);
    const notDue = await seedOnboardedUser(admin);
    const stuckOld = await seedOnboardedUser(admin);
    const stuckFresh = await seedOnboardedUser(admin);
    const everyone = [due, notDue, stuckOld, stuckFresh];

    try {
      const { error } = await admin.from('deletion_requests').insert([
        { user_id: due.userId, scheduled_for: isoIn(-1), status: 'pending' },
        { user_id: notDue.userId, scheduled_for: isoIn(1), status: 'pending' },
        {
          user_id: stuckOld.userId,
          scheduled_for: isoIn(-2),
          status: 'processing',
          claimed_at: isoMinutesAgo(120),
        },
        {
          user_id: stuckFresh.userId,
          scheduled_for: isoIn(-2),
          status: 'processing',
          claimed_at: isoMinutesAgo(5),
        },
      ]);
      if (error) throw new Error(`seed requests: ${error.message}`);

      // `claim_pending_deletions` is GLOBAL by design — it takes every due row
      // in the table, not this test's. So assertions are scoped to the four
      // users seeded here rather than to the whole result set: on an ephemeral
      // CI database the two are identical, but on a developer's local stack any
      // leftover row would make an exact-equality assertion fail for a reason
      // that has nothing to do with the behaviour under test. Measured: it did.
      const mine = new Set(everyone.map((u) => u.userId));
      const scoped = (rows: Array<{ userId: string }>) =>
        rows
          .map((r) => r.userId)
          .filter((id) => mine.has(id))
          .sort();

      const first = await claimPendingDeletionsWith(admin, 100);

      // The row stranded for two hours comes back; the one claimed five minutes
      // ago does NOT — a live run must never have its batch stolen. This is the
      // pair of assertions that the `requested_at` version of the guard passed
      // vacuously, because a row is only due a whole grace period after being
      // requested, so that test was always true and re-queued everything.
      expect(scoped(first)).toEqual([due.userId, stuckOld.userId].sort());

      // Immediately again: everything due is now `processing` with a fresh
      // `claimed_at`, so there is nothing left to take.
      expect(scoped(await claimPendingDeletionsWith(admin, 100))).toEqual([]);

      const { data: notDueRow } = await admin
        .from('deletion_requests')
        .select('status')
        .eq('user_id', notDue.userId)
        .maybeSingle();
      expect(notDueRow?.status).toBe('pending');
    } finally {
      for (const user of everyone) await deleteSeededUser(admin, user.userId);
    }
  });

  test('refuses a second active request for the same person', async () => {
    if (!admin) return;

    const user = await seedOnboardedUser(admin);
    try {
      const { error: first } = await admin
        .from('deletion_requests')
        .insert({ user_id: user.userId, scheduled_for: isoIn(14), status: 'pending' });
      expect(first).toBeNull();

      const { error: second } = await admin
        .from('deletion_requests')
        .insert({ user_id: user.userId, scheduled_for: isoIn(14), status: 'pending' });

      // `deletion_requests_one_active_idx`. `requestDeletion` catches this code
      // and answers with the EXISTING deadline rather than a new one.
      expect(second?.code).toBe('23505');
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  /**
   * The three UI fixes of this PR had NO test — not unit, not end-to-end. A
   * revert of any of the three would have passed CI in silence, and each one is
   * an art. 12(1) defect: telling someone something false about an irreversible
   * act. Found by `test-quality-auditor`, closed here.
   *
   * They are covered together because they are one journey: during `processing`
   * the settings page must keep pointing at the status screen, and the status
   * screen must not announce a completed erasure.
   */
  test('during processing, the UI keeps the status reachable and stops promising a cancellation', async ({
    page,
  }) => {
    if (!admin) return;

    const user = await seedOnboardedUser(admin);
    try {
      const { error } = await admin.from('deletion_requests').insert({
        user_id: user.userId,
        scheduled_for: isoIn(-1),
        status: 'processing',
        claimed_at: new Date().toISOString(),
      });
      if (error) throw new Error(`seed processing request: ${error.message}`);

      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      // `settings/page.tsx` filtered on `status='pending'` alone, so `deletion`
      // was null during `processing`: the danger zone fell back to the REQUEST
      // FORM and dropped the only link to the status screen — exactly when the
      // erasure had become irreversible.
      await page.goto('/app/settings');
      const viewStatus = page.getByRole('link', { name: /voir le statut/i });
      await expect(viewStatus).toBeVisible();
      // The request form must NOT be back.
      await expect(page.getByLabel(/raison/i)).toHaveCount(0);
      // And the copy must not still promise a cancellation.
      await expect(page.getByText(/annuler à tout moment/i)).toHaveCount(0);

      await viewStatus.click();
      await page.waitForURL(/deletion-status/);

      // `processing` used to fall through to the `completed` branch — an
      // erasure in flight announced as already done, in red.
      await expect(page.getByText('En cours', { exact: true })).toBeVisible();
      await expect(page.getByText('Complétée', { exact: true })).toHaveCount(0);
      // No cancel affordance: a run owns the row and GoTrue may already have
      // been called.
      await expect(page.getByRole('button', { name: /annuler la suppression/i })).toHaveCount(0);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('an authenticated JWT cannot create a request, nor move one to processing', async () => {
    if (!admin) return;
    test.skip(!ANON_KEY, 'Needs NEXT_PUBLIC_SUPABASE_ANON_KEY to build a client-role session.');

    const user = await seedOnboardedUser(admin);
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    try {
      const { error: signInError } = await asUser.auth.signInWithPassword({
        email: user.email,
        password: user.password,
      });
      expect(signInError).toBeNull();

      // `deletion_self_insert` is GONE (ADR-024 D3). While it existed, a client
      // could insert its own row with `scheduled_for` in the past — inert until
      // the cron was armed, then immediate self-deletion, defeating the very
      // grace period that mitigates a stolen session.
      const { error: insertError } = await asUser
        .from('deletion_requests')
        .insert({ user_id: user.userId, scheduled_for: isoIn(-1), status: 'pending' });
      expect(insertError).not.toBeNull();

      // `20260727000002` — EXECUTE revoked from anon AND authenticated.
      // `revoke … from public` alone left Supabase's default grants in place,
      // and a future migration re-adding one would otherwise pass CI in
      // silence. This is the same class of mistake `20260727000001` made.
      const { error: rpcError } = await asUser.rpc('claim_pending_deletions', { batch_size: 1 });
      expect(rpcError?.code).toBe('42501');

      const { error: seedError } = await admin
        .from('deletion_requests')
        .insert({ user_id: user.userId, scheduled_for: isoIn(14), status: 'pending' });
      expect(seedError).toBeNull();

      // `with check (status='cancelled')` — the only transition left.
      const { data: escalated } = await asUser
        .from('deletion_requests')
        .update({ status: 'processing' })
        .eq('user_id', user.userId)
        .select('id');
      expect(escalated ?? []).toHaveLength(0);

      const { data: stillPending } = await admin
        .from('deletion_requests')
        .select('status')
        .eq('user_id', user.userId)
        .maybeSingle();
      expect(stillPending?.status).toBe('pending');

      // And the legitimate journey still works — the policy is narrow, not shut.
      const { data: cancelled } = await asUser
        .from('deletion_requests')
        .update({ status: 'cancelled' })
        .eq('user_id', user.userId)
        .select('id');
      expect(cancelled ?? []).toHaveLength(1);
    } finally {
      await asUser.auth.signOut();
      await deleteSeededUser(admin, user.userId);
    }
  });
});
