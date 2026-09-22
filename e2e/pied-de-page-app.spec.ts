import { test, expect } from './helpers/test';
import type { Locator, Page } from '@playwright/test';

import { adminClientOrNull, deleteSeededUser } from './helpers/seed';
import { semerCockpit } from './helpers/semis-cockpit';
import type { Seme } from './helpers/semis-cockpit';

const admin = adminClientOrNull();

/**
 * Le pied de page DANS `/app` — décision de @thierry du 22 septembre 2026
 * (option A) : rien sous 1024 px, une seule ligne de 48 px au plus à partir de
 * 1024 px.
 *
 * Avant : 121 px à 375 (logo et © seulement, les liens étaient déjà masqués) et
 * 125 px à 1440, sur chaque page connectée. Entre 1024 et 1279 px, la barre basse
 * avait disparu (lg) mais les liens du pied de page n'apparaissaient qu'à 1280
 * (xl) : ni liens légaux ni « Modifier mes préférences cookies » n'étaient
 * visibles dans `/app` sur cette bande.
 *
 * Ce qui est mesuré :
 * - à 1440 ET à 1024 : la ligne est visible, haute de 48 px au plus, porte les
 *   quatre liens et le bouton des préférences, chacun cible de 24 px au moins
 *   (WCAG 2.2, 2.5.8) ;
 * - à 375 : aucun pied de page affiché, et CHAQUE entrée (quatre liens, bouton
 *   des préférences) s'atteint depuis « Plus » au CLAVIER seul — Tab jusqu'à
 *   elle, Entrée, et la destination s'ouvre. Le © est dans la feuille.
 */

const LIENS = [
  { testId: 'more-sheet-link-legal-cgu', url: /\/legal\/cgu$/ },
  { testId: 'more-sheet-link-legal-privacy', url: /\/legal\/privacy$/ },
  { testId: 'more-sheet-link-legal-cookies', url: /\/legal\/cookies$/ },
  { testId: 'more-sheet-link-faq', url: /\/faq$/ },
] as const;

async function seConnecter(page: Page, user: Seme): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Mot de passe').fill(user.password);
  await page.getByRole('button', { name: /^se connecter$/i }).click();
  await page.waitForURL(/\/app\b/, { timeout: 20_000 });
  await expect(page.getByTestId('cockpit-il-te-reste')).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Ouvre « Plus » au clavier : focus sur l'onglet, Entrée. */
async function ouvrirPlusAuClavier(page: Page): Promise<void> {
  // Le cockpit est rendu par le serveur, donc visible AVANT que la barre soit
  // hydratée : une touche Entrée envoyée trop tôt tombe sur un bouton sans
  // gestionnaire. On attend la fin du chargement, pas un délai.
  await page.waitForLoadState('networkidle');
  await page.getByTestId('bottom-tab-more').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('more-sheet')).toBeVisible();
}

/** Tab jusqu'à la cible, sans jamais la cliquer ni lui donner le focus d'office. */
async function tabulerJusqua(page: Page, cible: Locator): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    if (await cible.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(cible, 'la cible ne reçoit jamais le focus à la tabulation').toBeFocused();
}

test.describe('pied de page de /app — une ligne au bureau, rien sous 1024', () => {
  test.skip(!admin, 'Needs a local Supabase (E2E_SUPABASE_READY=1).');
  test.setTimeout(180_000);

  let user: Seme | null = null;

  test.beforeAll(async () => {
    if (!admin) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    if (!url.includes('127.0.0.1')) {
      throw new Error(
        `Refus: cette spec ÉCRIT (un ménage fictif) et NEXT_PUBLIC_SUPABASE_URL=${url} ` +
          `ne contient pas 127.0.0.1. Lance-la contre la pile locale.`,
      );
    }
    user = await semerCockpit(admin);
  });

  test.afterAll(async () => {
    if (admin && user) await deleteSeededUser(admin, user.userId);
  });

  for (const vue of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
  ]) {
    test(`à ${vue.width}, une seule ligne de 48 px au plus, avec les cinq entrées`, async ({
      page,
    }) => {
      if (!user) return;
      await page.setViewportSize(vue);
      await seConnecter(page, user);

      const pied = page.locator('footer');
      await expect(pied, 'un seul pied de page').toHaveCount(1);
      await expect(pied).toBeVisible();
      const boite = await pied.boundingBox();
      expect(boite, 'pied de page sans boîte').not.toBeNull();
      expect(boite!.height, `hauteur du pied de page à ${vue.width}`).toBeLessThanOrEqual(48);

      const cibles = [
        pied.getByRole('link', { name: 'CGU' }),
        pied.getByRole('link', { name: 'Confidentialité' }),
        pied.getByRole('link', { name: 'Politique cookies' }),
        pied.getByRole('link', { name: 'FAQ' }),
        pied.getByRole('button', { name: 'Modifier mes préférences cookies' }),
      ];
      for (const cible of cibles) {
        await expect(cible).toBeVisible();
        const b = await cible.boundingBox();
        expect(b!.height, 'cible sous 24 px (WCAG 2.5.8)').toBeGreaterThanOrEqual(24);
        expect(b!.width, 'cible sous 24 px (WCAG 2.5.8)').toBeGreaterThanOrEqual(24);
      }
      await expect(pied.getByRole('link', { name: /accueil ankora/i })).toHaveCount(0);
      await expect(pied).toContainText(`© ${new Date().getFullYear()} Ankora`);
    });
  }

  test('à 375, aucun pied de page, et chaque entrée s’atteint depuis « Plus » au clavier', async ({
    page,
  }) => {
    if (!user) return;
    await page.setViewportSize({ width: 375, height: 812 });
    await seConnecter(page, user);

    // Aucun <footer> AFFICHÉ : la sonde regarde tous les pieds de page, pas le
    // premier, pour ne pas se laisser rassurer par un élément masqué.
    const affiches = await page.evaluate(
      () =>
        [...document.querySelectorAll('footer')].filter(
          (f) => f.getBoundingClientRect().height > 0 && getComputedStyle(f).display !== 'none',
        ).length,
    );
    expect(affiches, 'un pied de page est affiché à 375').toBe(0);

    await ouvrirPlusAuClavier(page);
    await expect(page.getByTestId('more-sheet')).toContainText(
      `© ${new Date().getFullYear()} Ankora`,
    );

    for (const { testId, url } of LIENS) {
      await page.goto('/app');
      await expect(page.getByTestId('cockpit-il-te-reste')).toBeVisible();
      await ouvrirPlusAuClavier(page);
      const lien = page.getByTestId(testId);
      await tabulerJusqua(page, lien);
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(url);
    }

    await page.goto('/app');
    await expect(page.getByTestId('cockpit-il-te-reste')).toBeVisible();
    await ouvrirPlusAuClavier(page);
    const preferences = page
      .getByTestId('more-sheet-cookie-preferences')
      .getByRole('button', { name: 'Modifier mes préférences cookies' });
    await tabulerJusqua(page, preferences);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('consent-banner')).toBeVisible();
  });
});
