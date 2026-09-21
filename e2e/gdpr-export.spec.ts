import { readFile } from 'node:fs/promises';

import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();

/**
 * The art. 20 export, downloaded for real, against a real schema.
 *
 * The unit tests (`src/lib/gdpr/__tests__/export.test.ts`) pin the SHAPE of each
 * query on a mock that does not filter anything. Only a real PostgREST shows
 * that the columns named exist and that the filters exclude another person's
 * rows — so this spec seeds TWO users and downloads the first one's export.
 */
test.describe('GDPR export — art. 20, every table, one person', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  test('exports the debts and payments of the person, and nothing of anyone else', async ({
    page,
  }) => {
    if (!admin) return;

    // Seeded inside the guarded block, each id tracked the moment it exists:
    // a failure on the SECOND creation used to leak the first person's account
    // in the database the next run seeds into.
    const seededUserIds: string[] = [];

    try {
      const seed = async (label: string, amount: number) => {
        const user = await seedOnboardedUser(admin, [
          { label, amount, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
        ]);
        seededUserIds.push(user.userId);
        return user;
      };
      const alice = await seed('Loyer', 800);
      const bob = await seed('Charge de Bob E2E', 123);

      const commitment = (label: string, user: typeof alice) => ({
        workspace_id: user.workspaceId,
        created_by: user.userId,
        label,
        kind: 'debt',
        total_amount: 3000,
        installment_amount: 250,
        installments_total: 12,
        start_year: 2026,
        start_month: 9,
      });
      const { data: aliceDebt, error: aliceDebtError } = await admin
        .from('commitments')
        .insert(commitment('Prêt auto Alice E2E', alice))
        .select('id')
        .single();
      if (aliceDebtError || !aliceDebt)
        throw new Error(`seed commitment: ${aliceDebtError?.message}`);
      const { error: bobDebtError } = await admin
        .from('commitments')
        .insert(commitment('Dette de Bob E2E', bob));
      if (bobDebtError) throw new Error(`seed bob commitment: ${bobDebtError.message}`);

      const { error: paymentError } = await admin.from('commitment_payments').insert({
        commitment_id: aliceDebt.id,
        workspace_id: alice.workspaceId,
        period_year: 2026,
        period_month: 9,
        paid_amount: 250,
        created_by: alice.userId,
        paid_from_account_type: 'income_bills',
      });
      if (paymentError) throw new Error(`seed commitment payment: ${paymentError.message}`);

      await page.goto('/login');
      await page.getByLabel('Email').fill(alice.email);
      await page.getByLabel('Mot de passe').fill(alice.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      await page.goto('/app/settings');
      const downloadPromise = page.waitForEvent('download', { timeout: 20_000 });
      await page.getByRole('button', { name: /télécharger mes données/i }).click();
      const download = await downloadPromise;
      const path = await download.path();
      const raw = await readFile(path, 'utf8');
      const bundle = JSON.parse(raw) as Record<string, unknown>;

      // Format: the nine 1.0 keys, plus the seven of 1.1.
      expect(bundle.schemaVersion).toBe('1.2');
      for (const key of [
        'user',
        'workspaces',
        'charges',
        'expenses',
        'categories',
        'consents',
        'auditLog',
        'accounts',
        'workspaceSettings',
        'commitments',
        'commitmentPayments',
        'chargePayments',
        'workspaceMemberships',
        'deletionRequests',
      ]) {
        expect(bundle, `missing key ${key}`).toHaveProperty(key);
      }

      // The person's own rows are there — the real columns exist.
      const labels = (bundle.commitments as Array<{ label: string }>).map((c) => c.label);
      expect(labels).toEqual(['Prêt auto Alice E2E']);
      expect(bundle.commitmentPayments as unknown[]).toHaveLength(1);
      const accounts = bundle.accounts as Array<{ workspace_id: string }>;
      expect(accounts.length).toBeGreaterThan(0);
      expect(accounts.every((a) => a.workspace_id === alice.workspaceId)).toBe(true);
      const memberships = bundle.workspaceMemberships as Array<Record<string, unknown>>;
      expect(memberships).toEqual([
        expect.objectContaining({ workspace_id: alice.workspaceId, role: 'owner' }),
      ]);
      expect(Object.keys(memberships[0]!).sort()).toEqual(['joined_at', 'role', 'workspace_id']);

      // Isolation: nothing of the other person, anywhere in the file.
      expect(raw).not.toContain(bob.userId);
      expect(raw).not.toContain(bob.workspaceId);
      expect(raw).not.toContain(bob.email);
      expect(raw).not.toContain('Dette de Bob E2E');
      expect(raw).not.toContain('Charge de Bob E2E');
    } finally {
      // Best effort, and every id gets its turn: a cleanup that throws on the
      // first account would leave the second one behind for good.
      for (const userId of seededUserIds) {
        await deleteSeededUser(admin, userId).catch((error: unknown) => {
          // A leaked account must be visible in the run log, not swallowed.
          console.warn(`gdpr-export cleanup: deleting ${userId} failed — ${String(error)}`);
        });
      }
    }
  });
});
