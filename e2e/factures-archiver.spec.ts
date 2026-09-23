/**
 * F-18 — archive a paid bill, find it under « Factures archivées (1) »,
 * restore it. Signed in on the LOCAL Supabase stack only (127.0.0.1).
 *
 * What it proves, at 375 px, the way a person does it:
 *   - « Archiver » exists only for a bill that has a payment, and is reached
 *     from the bill's drawer;
 *   - the archived bill leaves the active list and waits, folded, below it;
 *   - « Restaurer » brings it back, and nothing was deleted on the way:
 *     `is_active` flips in the database and the payment row survives both
 *     gestures;
 *   - « Il te reste » is read on the cockpit before, after archiving and after
 *     restoring. Archiving goes through `is_active`, the column every money
 *     path already reads, so the figure after archiving must equal the figure
 *     of a workspace where that bill never counted (asserted against a second,
 *     seeded twin), and the figure after restoring must equal the first one.
 *
 * Fictitious data only (505 € / 705 €).
 */
import type { Page } from '@playwright/test';
import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();
type SeededUser = Awaited<ReturnType<typeof seedOnboardedUser>>;

test.use({ viewport: { width: 375, height: 812 } });

async function seConnecter(page: Page, user: SeededUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Mot de passe').fill(user.password);
  await page.getByRole('button', { name: /^se connecter$/i }).click();
  await page.waitForURL(/\/app\b/, { timeout: 20_000 });
}

/** A drawer that is still closing swallows the next tap: retry the open, as operations-compte does. */
async function ouvrirTiroir(page: Page, chargeId: string): Promise<void> {
  const tiroir = page.getByTestId('charge-edit-drawer');
  await expect(async () => {
    await page.getByTestId(`charges-row-edit-${chargeId}`).click();
    await expect(tiroir).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

async function lireIlTeReste(page: Page): Promise<string> {
  await page.goto('/app');
  const formule = page.getByTestId('cockpit-formule');
  await expect(formule).toContainText('€');
  return (await formule.textContent()) ?? '';
}

test.describe.serial('Factures — archiver puis restaurer une facture payée (F-18)', () => {
  test.skip(!admin, 'Needs a local Supabase (E2E_SUPABASE_READY=1).');

  let a: SeededUser | null = null;
  let jumeau: SeededUser | null = null;
  let loyerId = '';
  let assuranceId = '';

  test.beforeAll(async () => {
    if (!admin) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    if (!url.includes('127.0.0.1')) {
      throw new Error(
        `Refus: cette spec ÉCRIT des factures et NEXT_PUBLIC_SUPABASE_URL=${url} ` +
          "n'est pas une pile locale. Elle ne tourne que contre 127.0.0.1.",
      );
    }
    a = await seedOnboardedUser(admin, [
      { label: 'Loyer', amount: 705, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
      { label: 'Assurance', amount: 505, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
    ]);
    // The twin: same income, same rent, and the insurance never existed.
    jumeau = await seedOnboardedUser(admin, [
      { label: 'Loyer', amount: 705, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
    ]);
    for (const u of [a, jumeau]) {
      const { error } = await admin
        .from('workspaces')
        .update({ monthly_income: 2505 })
        .eq('id', u.workspaceId);
      if (error) throw new Error(`semis revenu: ${error.message}`);
    }
    const { data, error } = await admin
      .from('charges')
      .select('id, label')
      .eq('workspace_id', a.workspaceId);
    if (error || !data) throw new Error(`lecture factures: ${error?.message}`);
    loyerId = data.find((c) => c.label === 'Loyer')!.id;
    assuranceId = data.find((c) => c.label === 'Assurance')!.id;
  });

  test.afterAll(async () => {
    if (admin && a) await deleteSeededUser(admin, a.userId);
    if (admin && jumeau) await deleteSeededUser(admin, jumeau.userId);
  });

  test('archiver, retrouver sous « Factures archivées (1) », restaurer', async ({
    page,
    browser,
  }) => {
    if (!admin || !a || !jumeau) return;
    test.setTimeout(150_000);

    // The twin's figure: what « Il te reste » is when the insurance never counted.
    const ctxJumeau = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const pageJumeau = await ctxJumeau.newPage();
    await seConnecter(pageJumeau, jumeau);
    const sansAssurance = await lireIlTeReste(pageJumeau);
    await ctxJumeau.close();

    await seConnecter(page, a);

    // 1. Pay the insurance — the gesture that makes « Archiver » available.
    await page.goto('/app/charges');
    // A tap before hydration does nothing; tap again only while the database
    // has not seen it, so a late first tap is never undone by a second one.
    const paiementsAssurance = async () =>
      (
        await admin
          .from('charge_payments')
          .select('charge_id', { count: 'exact', head: true })
          .eq('charge_id', assuranceId)
      ).count;
    await expect(async () => {
      if ((await paiementsAssurance()) === 0) {
        await page.getByTestId(`charges-row-paid-${assuranceId}`).click();
      }
      await expect.poll(paiementsAssurance, { timeout: 3_000 }).toBe(1);
    }).toPass({ timeout: 30_000 });

    const avant = await lireIlTeReste(page);

    // 2. A bill never paid offers no « Archiver ».
    await page.goto('/app/charges');
    await ouvrirTiroir(page, loyerId);
    await expect(page.getByTestId('charge-edit-archive')).toHaveCount(0);
    await page.getByTestId('charge-edit-cancel').click();
    await expect(page.getByTestId('charge-edit-drawer')).toHaveCount(0);

    // 3. Archive the paid one from its drawer — no confirmation (G-53).
    await ouvrirTiroir(page, assuranceId);
    await page.getByTestId('charge-edit-archive').click();

    const repli = page.getByRole('button', { name: 'Factures archivées (1)' });
    await expect(repli).toBeVisible({ timeout: 15_000 });
    await expect(repli).toHaveAttribute('aria-expanded', 'false');
    await expect(
      page.getByTestId('charges-list').getByTestId(`charges-row-${assuranceId}`),
    ).toHaveCount(0);

    const etat = async () =>
      (await admin.from('charges').select('is_active').eq('id', assuranceId).single()).data
        ?.is_active;
    const paiements = paiementsAssurance;
    expect(await etat()).toBe(false);
    expect(await paiements()).toBe(1);

    const archivee = await lireIlTeReste(page);
    expect(archivee).toBe(sansAssurance);

    // 4. Restore it from the fold.
    await page.goto('/app/charges');
    const repliArchives = page.getByRole('button', { name: 'Factures archivées (1)' });
    await expect(async () => {
      if ((await repliArchives.getAttribute('aria-expanded')) !== 'true')
        await repliArchives.click();
      await expect(repliArchives).toHaveAttribute('aria-expanded', 'true', { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    const ligne = page.getByTestId(`charges-archived-row-${assuranceId}`);
    await expect(ligne).toContainText('Assurance');
    await ligne.getByRole('button', { name: 'Restaurer Assurance' }).click();

    await expect(
      page.getByTestId('charges-list').getByTestId(`charges-row-${assuranceId}`),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Factures archivées/ })).toHaveCount(0);
    expect(await etat()).toBe(true);
    expect(await paiements()).toBe(1);

    const restauree = await lireIlTeReste(page);
    expect(restauree).toBe(avant);
  });
});
