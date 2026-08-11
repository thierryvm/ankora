import { createClient } from '@supabase/supabase-js';

import type { Page } from '@playwright/test';

import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';
import {
  claimPendingDeletionsWith,
  countDeletionQueueAlertsWith,
  executeDeletionWith,
  recordDeletionAttemptWith,
} from '@/lib/gdpr/deletion-core';

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

/**
 * Click a CLIENT-component control and wait until it actually did something.
 *
 * Playwright can click a server-rendered button before React has attached its
 * handler: the click lands on the DOM, nothing happens, and the test fails
 * describing a broken feature. Measured on this suite, 2026-08-11 — the failure
 * snapshot showed the confirmation field filled and the submit button still
 * `disabled`, i.e. a component that had rendered but was not listening.
 *
 * So the CLICK is retried, never the assertion: `settled` is read from the
 * database, and a journey that is genuinely broken still fails — it just fails
 * for its own reason instead of for a race.
 */
async function clickUntilSettled(
  page: Page,
  name: RegExp,
  settled: () => Promise<boolean>,
): Promise<void> {
  await expect(async () => {
    if (!(await settled())) {
      await page.getByRole('button', { name }).click({ timeout: 2_000 });
    }
    expect(await settled()).toBe(true);
  }).toPass({ timeout: 25_000, intervals: [250, 500, 1_000, 2_000] });
}

/** The seeded-user login, factored out once four cases needed it. */
async function signIn(page: Page, user: { email: string; password: string }): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Mot de passe').fill(user.password);
  await page.getByRole('button', { name: /^se connecter$/i }).click();
  await page.waitForURL(/\/app\b/, { timeout: 15_000 });
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

      await signIn(page, user);

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

  /**
   * ADR-042 proof 6 — the verdict is REALLY written on the row.
   *
   * Never a mock, and the reason is measured rather than theoretical:
   * `deletion_requests` carries FORCE ROW LEVEL SECURITY, where a privileged
   * write can match zero rows and report success — that is what H3 was. A unit
   * test with a fake client would go green on a write that never lands.
   */
  test('writes the attempt verdict onto the row — against the real schema', async () => {
    if (!admin) return;

    const user = await seedOnboardedUser(admin);
    try {
      const { data: seeded, error } = await admin
        .from('deletion_requests')
        .insert({
          user_id: user.userId,
          scheduled_for: isoIn(-1),
          status: 'processing',
          claimed_at: new Date().toISOString(),
          attempts: 1,
          attempt_cycle_started_at: new Date().toISOString(),
          last_error_code: 'not_attempted',
        })
        .select('id')
        .single();
      if (error) throw new Error(`seed request: ${error.message}`);

      const before = Date.now();
      const touched = await recordDeletionAttemptWith(admin, seeded.id, 'gotrue_error');
      // The COUNT, not just the absence of an error. Zero is the silent failure.
      expect(touched).toBe(1);

      const { data: after } = await admin
        .from('deletion_requests')
        .select('last_error_code, last_attempted_at, attempts')
        .eq('id', seeded.id)
        .single();

      expect(after?.last_error_code).toBe('gotrue_error');
      // A REAL attempt is now dated, and it replaced `not_attempted` — that
      // pair is the only thing separating a row claimed five times from a row
      // genuinely tried five times.
      expect(new Date(after?.last_attempted_at ?? 0).getTime()).toBeGreaterThanOrEqual(before);
      // And the verdict does not touch the counter: the claim owns it.
      expect(after?.attempts).toBe(1);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  /**
   * ADR-042 G6 — the admin counters really SEE something.
   *
   * This is the H3 ground. `deletion_requests` is FORCE ROW LEVEL SECURITY with
   * self-only policies, so a privileged read there can quietly return nothing,
   * and a founder-only screen showing a confident `0` would be indistinguishable
   * from a healthy queue. The unit test cannot tell the difference — its client
   * is a fake. Only a read against the real schema can.
   *
   * Both counters are asserted as DELTAS, not absolutes: on a local stack any
   * leftover row would make an exact-equality assertion fail for a reason that
   * has nothing to do with what is under test.
   */
  test('the admin counters see through FORCE RLS, and the second is wider than the first', async () => {
    if (!admin) return;

    const quarantined = await seedOnboardedUser(admin);
    const starving = await seedOnboardedUser(admin);
    try {
      const before = await countDeletionQueueAlertsWith(admin);

      const { error } = await admin.from('deletion_requests').insert([
        {
          user_id: quarantined.userId,
          requested_at: isoIn(-28),
          scheduled_for: isoIn(-14),
          status: 'failed',
          attempts: 5,
          attempt_cycle_started_at: isoIn(-6),
        },
        // Never quarantined — just old, and walking into non-compliance. This
        // row is the entire reason counter 2 is not restricted to `failed`.
        //
        // `attempts: 0` is spelled out rather than left to the default: a BULK
        // insert through PostgREST unifies the column list across the array, so
        // a key omitted here is sent as an explicit NULL — which a `not null`
        // column refuses no matter what its default says. Measured.
        {
          user_id: starving.userId,
          requested_at: isoIn(-27),
          scheduled_for: isoIn(-13),
          status: 'pending',
          attempts: 0,
        },
      ]);
      if (error) throw new Error(`seed alert rows: ${error.message}`);

      const after = await countDeletionQueueAlertsWith(admin);

      // Read at all — a refused read would leave both deltas at zero.
      expect(after.stuck - before.stuck).toBe(1);
      // TWO, not one: the quarantined row AND the starving `pending` one. A
      // counter narrowed to `failed` would answer 1 here and miss a breach.
      expect(after.nearBreach - before.nearBreach).toBe(2);
    } finally {
      await deleteSeededUser(admin, quarantined.userId);
      await deleteSeededUser(admin, starving.userId);
    }
  });

  /**
   * ADR-042 proofs 7 and 11 — a quarantined request keeps BOTH ways out, and
   * the settings page still points at them.
   *
   * The defect this closes is not a missing feature. While the queue had no
   * notion of an attempt, someone whose erasure failed in a loop READ that the
   * deletion had started and could no longer be cancelled, and the button was
   * taken away from them — strictly worse than the original bug, which at least
   * left the button.
   */
  test('a quarantined request shows the truth, and offers cancel AND relaunch', async ({
    page,
  }) => {
    if (!admin) return;

    const user = await seedOnboardedUser(admin);
    try {
      const { error } = await admin.from('deletion_requests').insert({
        user_id: user.userId,
        scheduled_for: isoIn(-20),
        status: 'failed',
        attempts: 5,
        attempt_cycle_started_at: isoIn(-6),
        last_error_code: 'gotrue_error',
      });
      if (error) throw new Error(`seed failed request: ${error.message}`);

      await signIn(page, user);

      // Proof 11, first half: the settings page must not fall over. `failed` is
      // in the uniqueness index, so it must also be in the `.in(...)` of that
      // page — otherwise `.maybeSingle()` is fine but the danger zone falls back
      // to the REQUEST FORM and drops the only route to this screen.
      await page.goto('/app/settings');
      const viewStatus = page.getByRole('link', { name: /voir le statut/i });
      await expect(viewStatus).toBeVisible();
      await expect(page.getByLabel(/raison/i)).toHaveCount(0);

      await viewStatus.click();
      await page.waitForURL(/deletion-status/);

      await expect(page.getByText('En échec', { exact: true })).toBeVisible();
      // The cancel button is BACK: no run holds this row.
      await expect(page.getByRole('button', { name: /annuler la suppression/i })).toBeVisible();
      // And a way forward, which costs a typed address rather than a click.
      await expect(page.getByLabel(/pour relancer/i)).toBeVisible();
      // The copy must NOT still claim the erasure is under way and unstoppable.
      await expect(page.getByText(/ne peut plus être annulée/i)).toHaveCount(0);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  /**
   * ADR-042 proofs 8 and 10 — cancelling a quarantined request MOVES THE ROW,
   * and the person can then file a new one.
   *
   * Both halves matter and neither is decorative. The old `cancelDeletion`
   * filtered on `pending` alone: on a `failed` row it touched nothing, the
   * action still answered `ok`, and the button announced a cancellation that
   * had not happened. And without `failed` in `requestDeletion`'s lookup, the
   * person could never re-request their own erasure — a pure art. 17 blocker.
   */
  test('cancelling a quarantined request really cancels it, and a new one can follow', async ({
    page,
  }) => {
    if (!admin) return;

    const user = await seedOnboardedUser(admin);
    try {
      const { error } = await admin.from('deletion_requests').insert({
        user_id: user.userId,
        scheduled_for: isoIn(-20),
        status: 'failed',
        attempts: 5,
        attempt_cycle_started_at: isoIn(-6),
      });
      if (error) throw new Error(`seed failed request: ${error.message}`);

      await signIn(page, user);
      await page.goto('/app/settings/deletion-status');

      // Read the ROW, not the toast. A green toast is exactly what the defect
      // produced while nothing moved: the old filter matched no row on a
      // `failed` request and the action reported success anyway.
      const rowStatus = async (): Promise<string | null> => {
        const { data } = await admin
          .from('deletion_requests')
          .select('status')
          .eq('user_id', user.userId)
          .maybeSingle();
        return data?.status ?? null;
      };

      await clickUntilSettled(
        page,
        /annuler la suppression/i,
        async () => (await rowStatus()) === 'cancelled',
      );

      // Art. 17 stays open: the request form is back, and a new request lands.
      await page.goto('/app/settings');
      const confirmField = page.getByLabel(/tape ton adresse e-mail/i);
      const submit = page.getByRole('button', { name: /supprimer mon compte/i });

      // The fill is RETRIED until the button unlocks, and the reason is
      // measured rather than defensive. Playwright can type into the
      // server-rendered input before the client component is listening: the
      // value lands in the DOM, React's controlled state never hears about it,
      // and the submit button stays disabled for ever. The failure snapshot
      // showed exactly that — the address present in the field, the button
      // still `disabled`.
      //
      // This retries the INSTRUMENT, not the assertion: what is being proven
      // (a new request lands after a quarantined one is cancelled) is
      // unchanged, and still fails if the journey is broken.
      await expect(async () => {
        await confirmField.fill('');
        await confirmField.fill(user.email);
        await expect(submit).toBeEnabled({ timeout: 1_000 });
      }).toPass({ timeout: 20_000 });

      // NOT `rowStatus()` here: the cancelled row stays, so a second request
      // means TWO rows for this person and `.maybeSingle()` would error rather
      // than answer. A count on the pending ones says what we mean — and its
      // being exactly 1 is also what proves the uniqueness index still holds.
      await clickUntilSettled(page, /supprimer mon compte/i, async () => {
        const { count } = await admin
          .from('deletion_requests')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.userId)
          .eq('status', 'pending');
        return (count ?? 0) === 1;
      });
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  /**
   * ADR-042 proof 7bis — after a relaunch, the screen shows the DATE.
   *
   * And it shows it in the `pending` branch, which is the whole point: *retry*
   * puts the row back to `pending`, so the natural way to build this — "I add
   * the `failed` case, I leave the rest alone" — would write `retried_at` and
   * never display it. A column added to be read that nothing forces to appear
   * is the mute mechanism all of this is about.
   *
   * A date, not a state: a date can be checked, a state is merely believed.
   */
  test('after a relaunch, the status screen carries the date of the relaunch', async ({ page }) => {
    if (!admin) return;

    const user = await seedOnboardedUser(admin);
    try {
      const { error } = await admin.from('deletion_requests').insert({
        user_id: user.userId,
        scheduled_for: isoIn(-20),
        // Exactly the state `retryDeletion()` leaves behind: back in the queue,
        // counter and anchor cleared, relaunch dated.
        status: 'pending',
        attempts: 0,
        attempt_cycle_started_at: null,
        retried_at: new Date().toISOString(),
      });
      if (error) throw new Error(`seed relaunched request: ${error.message}`);

      await signIn(page, user);
      await page.goto('/app/settings/deletion-status');

      await expect(page.getByText(/demande relancée le/i)).toBeVisible();
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
