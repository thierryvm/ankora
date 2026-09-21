/**
 * PR C bis — the three account operations, on a real local stack, at 375 px.
 *
 * What this spec proves, and nothing else:
 * - « J'ai fait ce virement » (cockpit), « Argent reçu » and a balance
 *   statement (Mes comptes) each reach the base, and show on the screen;
 * - « Il te reste » reads the SAME, character for character, before and after
 *   a transfer done and money received (voie A, 2026-09-21: neither touches
 *   `accounts.balance`, and the formula is PR D);
 * - an income line is cancelled, then restored, from the screen (rule 11);
 * - every gesture leaves one audit event, without amount nor description;
 * - a second fictitious account reads and writes nothing of the first (RLS);
 * - Mes comptes keeps its page budget: 44 px targets, no overflow, axe clean,
 *   twelve amounts at most without a gesture.
 *
 * Fictitious figures only (the 505 / 705 family) — this repository is public.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';

import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';
import { ouvrirRepli } from './helpers/cockpit';
import { expectA11yPass } from './helpers/a11y';

const admin = adminClientOrNull();
type SeededUser = Awaited<ReturnType<typeof seedOnboardedUser>>;
const VUE = { width: 375, height: 812 } as const;
const CIBLE_MIN_PX = 44;
const BUDGET_MONTANTS = 12;
/*
 * A write is one server action: gate, rate limit, write, audit. On a poste
 * whose rate limiter points at an unreachable Upstash, the limiter waits for
 * its upstream timeout (~5 s, logged « Rate limit upstream error ») before
 * failing open. The wait is the environment's, not the gesture's: the
 * assertions below are unchanged, only how long they may wait for the toast.
 */
const ECRITURE_MS = 15_000;

test.use({ viewport: VUE });

async function seConnecter(page: Page, user: SeededUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Mot de passe').fill(user.password);
  await page.getByRole('button', { name: /^se connecter$/i }).click();
  await page.waitForURL(/\/app\b/, { timeout: 20_000 });
}

/** The formula line: revenus − déjà compté − dépensé = Il te reste. No animation. */
async function lireIlTeReste(page: Page): Promise<string> {
  await page.goto('/app');
  const formule = page.getByTestId('cockpit-formule');
  await expect(formule).toContainText('€');
  return (await formule.textContent()) ?? '';
}

/**
 * Opens a sheet and waits for it. A click that lands before hydration does
 * nothing (dev server compiling on first visit): retry the CLICK, never the
 * assertion on what the sheet then does.
 */
async function ouvrirFeuille(
  page: Page,
  bouton: ReturnType<Page['getByRole']>,
  testId: string,
): Promise<void> {
  const feuille = page.getByTestId(testId);
  await expect(async () => {
    await bouton.click();
    await expect(feuille).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

async function clientDe(user: SeededUser): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('NEXT_PUBLIC_SUPABASE_URL / ANON_KEY manquantes');
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw new Error(`signIn failed: ${error.message}`);
  return client;
}

test.describe.serial('Opérations de compte — trois gestes, un chiffre qui ne bouge pas', () => {
  test.skip(!admin, 'Needs a local Supabase (E2E_SUPABASE_READY=1).');

  let a: SeededUser | null = null;
  let b: SeededUser | null = null;

  test.beforeAll(async () => {
    if (!admin) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    if (!url.includes('127.0.0.1')) {
      throw new Error(
        `Refus: cette spec ÉCRIT des opérations et NEXT_PUBLIC_SUPABASE_URL=${url} ` +
          "n'est pas une pile locale. Elle ne tourne que contre 127.0.0.1.",
      );
    }
    a = await seedOnboardedUser(admin, [
      { label: 'Loyer', amount: 705, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
    ]);
    b = await seedOnboardedUser(admin);
    const { error } = await admin
      .from('workspaces')
      .update({ monthly_income: 2505, vie_courante_monthly_transfer: 505 })
      .eq('id', a.workspaceId);
    if (error) throw new Error(`semis revenu: ${error.message}`);
  });

  test.afterAll(async () => {
    if (admin && a) await deleteSeededUser(admin, a.userId);
    if (admin && b) await deleteSeededUser(admin, b.userId);
  });

  test('les trois gestes aboutissent ; un virement sans part libre ne bouge pas « Il te reste »', async ({
    page,
  }) => {
    if (!admin || !a) return;
    test.setTimeout(120_000);
    await seConnecter(page, a);
    const avant = await lireIlTeReste(page);

    // 1. « J'ai fait ce virement », depuis le cockpit.
    await ouvrirRepli(page, 'repli-virements');
    await ouvrirFeuille(
      page,
      page.getByRole('button', {
        name: 'J’ai fait ce virement : Virement à faire vers Dépenses du quotidien',
      }),
      'feuille-virement',
    );
    const feuilleVirement = page.getByTestId('feuille-virement');
    await expect(feuilleVirement.getByLabel('Combien as-tu viré ?')).toHaveValue('505');
    await feuilleVirement.getByRole('button', { name: /^enregistrer$/i }).click();
    await expect(page.getByText('Virement enregistré').first()).toBeVisible({
      timeout: ECRITURE_MS,
    });
    await expect(feuilleVirement).toBeHidden();

    expect(await lireIlTeReste(page), 'après un virement fait').toBe(avant);
    await ouvrirRepli(page, 'repli-virements');
    await expect(page.getByTestId('virement-fait').first()).toContainText('Fait le');

    // 2. « Argent reçu », depuis Mes comptes.
    await page.goto('/app/accounts');
    await ouvrirFeuille(
      page,
      page.getByRole('button', { name: 'Argent reçu', exact: true }),
      'feuille-argent-recu',
    );
    const feuilleRecu = page.getByTestId('feuille-argent-recu');
    await feuilleRecu.getByLabel('Combien as-tu reçu ?').fill('705');
    // Typed key by key, spaces around, as a finger would: `fill` sets the value
    // in one event and could not see the defect of 21 Sept. 2026 — every
    // keystroke in this parent-owned field sent focus back to the amount.
    const description = feuilleRecu.getByLabel('Description (facultatif)');
    await description.click();
    await description.pressSequentially('  Prime de septembre  ');
    await expect(description).toHaveValue('  Prime de septembre  ');
    await expect(feuilleRecu.getByLabel('Combien as-tu reçu ?')).toHaveValue('705');
    await feuilleRecu.getByRole('button', { name: /^enregistrer$/i }).click();
    await expect(page.getByText('Argent reçu enregistré').first()).toBeVisible({
      timeout: ECRITURE_MS,
    });
    await expect(feuilleRecu).toBeHidden();

    // PR D (declared in the PR): money received as « Mon revenu du mois » is the
    // ARRIVAL of the income and REPLACES the written one (2 505) — the mock-up's
    // rule. The figure therefore moves here, by design; before PR D it did not.
    const apresRecu = await lireIlTeReste(page);
    expect(apresRecu, 'après un argent reçu regular').not.toBe(avant);
    expect(apresRecu, 'le revenu reçu remplace le revenu écrit').toMatch(/ 705 − Déjà compté/u);

    // 3. Un relevé à découvert, sans signe moins à taper.
    await page.goto('/app/accounts');
    await ouvrirFeuille(
      page,
      page
        .locator('[data-account-balance="daily_card"]')
        .getByRole('button', { name: /écrire le solde du jour/i }),
      'feuille-releve',
    );
    const feuilleReleve = page.getByTestId('feuille-releve');
    await feuilleReleve.getByLabel(/quel est le solde de ce compte aujourd’hui/i).fill('42,50');
    await feuilleReleve.getByRole('checkbox', { name: 'Ce compte est à découvert' }).check();
    await feuilleReleve.getByRole('button', { name: /^enregistrer$/i }).click();
    await expect(page.getByText('Solde enregistré').first()).toBeVisible({ timeout: ECRITURE_MS });
    await expect(
      page.locator('[data-account-balance="daily_card"]').getByTestId('solde-lu'),
    ).toContainText(/[-−]42,50/);

    // La ligne d'argent reçu : Annuler, puis Rétablir — depuis l'écran.
    const carte = page.locator('[data-account-balance="income_bills"]');
    await ouvrirRepli(page, 'argent-recu');
    const ligne = carte.locator('[data-income-line]');
    await expect(ligne).toHaveCount(1);
    await expect(ligne).toContainText('Reçu le');
    // The description as the screen reads it: its own text node, trimmed.
    expect(
      await ligne
        .locator('span')
        .first()
        .evaluate((el) => el.firstChild?.textContent ?? null),
    ).toBe('Prime de septembre');
    await ligne.getByRole('button', { name: 'Annuler' }).click();
    await expect(ligne).toContainText('Argent reçu annulé', { timeout: ECRITURE_MS });
    await ligne.getByRole('button', { name: 'Rétablir' }).click();
    await expect(ligne).not.toContainText('Argent reçu annulé', { timeout: ECRITURE_MS });
    await expect(ligne.getByRole('button', { name: 'Annuler' })).toBeVisible();

    // La base : ce que l'écran a dit, écrit une fois.
    const { data: ops } = await admin
      .from('movements')
      .select('kind, amount, cancelled_at, income_nature, description')
      .eq('workspace_id', a.workspaceId);
    expect(ops?.map((o) => [o.kind, Number(o.amount), o.cancelled_at]).sort()).toEqual([
      ['income', 705, null],
      ['transfer', 505, null],
    ]);
    const income = ops?.find((o) => o.kind === 'income');
    expect(income?.income_nature).toBe('regular');
    expect(income?.description).toBe('Prime de septembre');

    // L'audit : un événement par geste, sans montant ni description.
    const { data: audit } = await admin
      .from('audit_log')
      .select('event_type, metadata')
      .eq('user_id', a.userId)
      .like('event_type', 'movement.%');
    expect(audit?.map((e) => e.event_type).sort()).toEqual([
      'movement.cancellation_set',
      'movement.cancellation_set',
      'movement.recorded',
      'movement.recorded',
    ]);
    // Keys, not values: a UUID may contain 505 or 705 by chance.
    const permises = ['resource_type', 'resource_id', 'previous_state', 'new_state'];
    for (const e of audit ?? []) {
      expect(Object.keys(e.metadata as object).filter((k) => !permises.includes(k))).toEqual([]);
    }
    expect(JSON.stringify(audit)).not.toMatch(/Prime de septembre/);
  });

  test('un second compte fictif ne lit ni n’écrit rien du premier (RLS réelle)', async () => {
    if (!admin || !a || !b) return;
    const { data: cible } = await admin
      .from('movements')
      .select('id')
      .eq('workspace_id', a.workspaceId)
      .limit(1)
      .single();
    expect(cible?.id, 'le premier compte doit avoir une opération').toBeTruthy();

    const intrus = await clientDe(b);

    const lecture = await intrus.from('movements').select('id').eq('workspace_id', a.workspaceId);
    expect(lecture.data ?? []).toEqual([]);
    const releves = await intrus
      .from('account_balance_statements')
      .select('id')
      .eq('workspace_id', a.workspaceId);
    expect(releves.data ?? []).toEqual([]);

    const modif = await intrus
      .from('movements')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('id', cible!.id)
      .select('id');
    expect(modif.data ?? []).toEqual([]);

    const ecriture = await intrus.from('movements').insert({
      workspace_id: a.workspaceId,
      created_by: b.userId,
      kind: 'income',
      to_account_type: 'income_bills',
      amount: 505,
      occurred_on: '2026-09-01',
      income_nature: 'extra',
      description: 'intrusion',
    });
    expect(ecriture.error, 'une écriture dans le compte d’autrui doit être refusée').not.toBeNull();

    const { data: apres } = await admin
      .from('movements')
      .select('id, cancelled_at, description')
      .eq('workspace_id', a.workspaceId);
    expect(apres?.every((r) => r.cancelled_at === null)).toBe(true);
    expect(apres?.some((r) => r.description === 'intrusion')).toBe(false);
  });

  test('Mes comptes à 375 : 44 px, aucun débordement, douze montants au plus, axe propre', async ({
    page,
  }) => {
    if (!admin || !a) return;
    await seConnecter(page, a);
    await page.goto('/app/accounts');
    await expect(page.getByRole('button', { name: 'Argent reçu', exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));

    const mesure = await page.evaluate(() => {
      const main = document.querySelector('main') ?? document.body;
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      const montants: string[] = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const texte = n.textContent ?? '';
        if (!/\d\s?€/u.test(texte)) continue;
        const r = n.parentElement?.getBoundingClientRect();
        if (r && r.width > 0 && r.height > 0) montants.push(texte.trim());
      }
      return {
        montants,
        debordement: document.body.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(
      mesure.montants.length,
      `montants lisibles sans geste: ${JSON.stringify(mesure.montants)}`,
    ).toBeLessThanOrEqual(BUDGET_MONTANTS);
    expect(mesure.debordement, 'débordement horizontal à 375 px').toBeLessThanOrEqual(1);

    const petites = async () =>
      page.locator('main a, main button, main input, main select').evaluateAll(
        (els, min) =>
          els
            .map((el) => {
              const r = el.getBoundingClientRect();
              const cible =
                el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
                  ? (el.closest('label')?.getBoundingClientRect() ?? r)
                  : r;
              return {
                texte: (el.textContent || el.getAttribute('aria-label') || el.id).slice(0, 40),
                hauteur: Math.round(cible.height),
                largeur: Math.round(cible.width),
                visible: r.width > 0 && r.height > 0,
              };
            })
            .filter((c) => c.visible && (c.hauteur < min || c.largeur < min)),
        CIBLE_MIN_PX,
      );

    await ouvrirRepli(page, 'argent-recu');
    expect(await petites(), `cibles sous ${CIBLE_MIN_PX} px`).toEqual([]);
    await expectA11yPass(page);

    // La feuille « Argent reçu » ouverte : mêmes exigences.
    await ouvrirFeuille(
      page,
      page.getByRole('button', { name: 'Argent reçu', exact: true }),
      'feuille-argent-recu',
    );
    const feuille = page.getByTestId('feuille-argent-recu');
    const dansFeuille = await feuille.locator('button, input, select').evaluateAll(
      (els, min) =>
        els
          .map((el) => {
            const r =
              el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
                ? (el.closest('label')?.getBoundingClientRect() ?? el.getBoundingClientRect())
                : el.getBoundingClientRect();
            return {
              texte: (el.textContent || el.getAttribute('aria-label') || el.id).slice(0, 40),
              hauteur: Math.round(r.height),
              largeur: Math.round(r.width),
              debordeADroite: Math.round(r.right) > window.innerWidth,
            };
          })
          .filter((c) => c.hauteur < min || c.largeur < min || c.debordeADroite),
      CIBLE_MIN_PX,
    );
    expect(dansFeuille, 'cibles de la feuille sous 44 px ou hors écran').toEqual([]);
    await expectA11yPass(page);
  });
});
