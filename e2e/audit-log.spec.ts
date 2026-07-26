import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();

/**
 * H3 / issue #192 — the service_role client used to carry the caller's session
 * cookie, so `logAuditEvent()` ran as `authenticated`, a role `audit_log`
 * denies. Every failure was swallowed (`log.error`, never a throw), so the
 * audit trail was silently empty for anything a signed-in user did.
 *
 * Measured on an uncorrected build, 2026-07-26: after a successful login and an
 * account rename, the local `audit_log` held ONLY `auth.rate_limited` and
 * `auth.password_reset` rows — the two events emitted BEFORE a session cookie
 * exists. Neither `auth.login` nor `account.renamed` was ever written.
 *
 * Both assertions below therefore fail on the code that preceded this spec.
 * They cover the two shapes that matter: an auth event (whose user_id depends
 * on the bootstrap trigger populating `public.users`, satisfying the
 * `audit_log.user_id` foreign key) and a Server Action mutation.
 */
test.describe('Audit trail — service_role writes actually land (H3 / #192)', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  test('a login and an account rename each leave an audit row', async ({ page }) => {
    if (!admin) return;

    const user = await seedOnboardedUser(admin, [
      {
        label: 'Loyer',
        amount: 800,
        frequency: 'monthly',
        dueMonth: 1,
        paidFrom: 'principal',
      },
    ]);

    const eventsForUser = async () => {
      const { data } = await admin
        .from('audit_log')
        .select('event_type')
        .eq('user_id', user.userId);
      return (data ?? []).map((row) => row.event_type);
    };

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      await expect
        .poll(eventsForUser, {
          timeout: 10_000,
          message: 'auth.login never reached audit_log',
        })
        .toContain('auth.login');

      // A Server Action mutation, using the same interaction the rename spec
      // exercises: the income_bills card title is an inline-editable button.
      const card = page.locator('[data-account-type="income_bills"]');
      await expect(card).toBeVisible();
      await card.getByRole('button', { name: /Renommer le compte/i }).click();
      const input = card.getByRole('textbox');
      await expect(input).toBeFocused();
      await input.fill('Belfius');
      await input.press('Enter');
      await expect(
        card.getByRole('button', { name: /Renommer le compte « Belfius »/i }),
      ).toBeVisible();

      await expect
        .poll(eventsForUser, {
          timeout: 10_000,
          message: 'account.renamed never reached audit_log',
        })
        .toContain('account.renamed');
    } finally {
      // Must run AFTER the assertions: deleting the user nulls `user_id` on
      // every row it owns, which would erase the very evidence being checked.
      await deleteSeededUser(admin, user.userId);
    }
  });
});
