import { test, expect } from './helpers/test';
import type { Page } from '@playwright/test';

import { adminClientOrNull, deleteSeededUser } from './helpers/seed';
import { semerCockpit } from './helpers/semis-cockpit';
import type { Seme } from './helpers/semis-cockpit';
import { ouvrirRepli } from './helpers/cockpit';

const admin = adminClientOrNull();

/**
 * La coquille de `/app` DÉFILÉE : le rail collé, et le pied de page posé.
 *
 * ## Ce que `coquille-v3.spec.ts` ne voyait pas
 *
 * Celle-là mesure le rail page EN HAUT seulement. Or le rail est collant, et un
 * élément collant ne sort jamais de son parent : quand le pied de page (hors du
 * conteneur du rail) entrait dans l'écran, le parent remontait et poussait le
 * rail sous l'en-tête de la hauteur du pied. « Tableau de bord » passait
 * derrière la barre. Le défaut n'existe QU'AU DÉFILEMENT, donc une mesure prise
 * à `scrollY = 0` ne peut, par construction, pas le voir.
 *
 * Même famille, côté téléphone : `cockpit-v3.spec.ts` vérifie que « le dernier
 * élément reste atteignable au-dessus de la barre », mais il ne regarde que
 * `main a, main button`. Le pied de page vit HORS de `<main>` : il n'est pas
 * dans la sonde, donc la réserve de la barre basse pouvait manquer sous lui sans
 * qu'aucune spec ne rougisse.
 *
 * ## Ce qui est mesuré
 *
 * - à 1440 : le haut du rail est celui de l'en-tête, page défilée en bas, repli
 *   ouvert, repli refermé ; et le premier lien du rail est VISIBLE, c'est-à-dire
 *   que le point où le doigt tomberait lui appartient (`elementFromPoint`) ;
 * - à 375 et 500 : sur une page longue (cockpit) et une page courte
 *   (engagements, un seul engagement), le bas du pied de page est exactement le
 *   haut de la barre basse — ni dessous (coupé), ni au-dessus (un vide) ;
 * - à 1440, sur la page courte : le pied de page touche le bas de la fenêtre.
 *
 * `elementFromPoint` rend `null` hors de la fenêtre : la sonde vérifie donc
 * d'abord que la boîte y est, sinon elle regarderait ailleurs.
 */

const TOLERANCE = 1;

async function seConnecter(page: Page, user: Seme): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Mot de passe').fill(user.password);
  await page.getByRole('button', { name: /^se connecter$/i }).click();
  await page.waitForURL(/\/app\b/, { timeout: 20_000 });
  await expect(page.getByTestId('cockpit-il-te-reste')).toBeVisible();
  // Les métriques d'Inter, pas celles de la police de secours : sinon la
  // hauteur du document mesurée n'est pas celle qu'un humain verra.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function enBas(page: Page): Promise<void> {
  // Instantané, et relu jusqu'à ce que la position ne bouge plus : la feuille de
  // style pose un défilement lissé, et une lecture prise en cours de route
  // mesure le défilement, pas la page. Un premier essai l'a fait : il lisait le
  // rail à mi-course, à 8 px au lieu de -69, et concluait autre chose.
  let precedent = -1;
  for (let i = 0; i < 20; i += 1) {
    const y = await page.evaluate(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      return Math.round(window.scrollY);
    });
    await page.waitForTimeout(120);
    if (y === precedent) return;
    precedent = y;
  }
  throw new Error('la page ne cesse pas de défiler ou de grandir');
}

/** Le rail : son haut, celui de l'en-tête, et si son premier lien est atteignable. */
async function lireRail(page: Page) {
  return page.evaluate(() => {
    const rail = document.querySelector('[data-testid="app-rail"]');
    const entete = document.querySelector('header');
    const lien = rail?.querySelector('a');
    if (!rail || !entete || !lien) return { erreur: 'rail, en-tête ou lien introuvable' as const };
    const r = rail.getBoundingClientRect();
    const l = lien.getBoundingClientRect();
    const x = Math.round(l.left + l.width / 2);
    const y = Math.round(l.top + l.height / 2);
    const dansLaVue = l.top >= 0 && l.bottom <= window.innerHeight;
    const auPoint = dansLaVue ? document.elementFromPoint(x, y) : null;
    return {
      erreur: null,
      scrollY: Math.round(window.scrollY),
      hautRail: Math.round(r.top * 10) / 10,
      basEntete: Math.round(entete.getBoundingClientRect().bottom * 10) / 10,
      hautLien: Math.round(l.top * 10) / 10,
      lienAtteignable: !!auPoint && (auPoint === lien || lien.contains(auPoint)),
    };
  });
}

/** Le pied de page et la barre basse, en coordonnées de fenêtre. */
async function lirePied(page: Page) {
  return page.evaluate(() => {
    const pied = document.querySelector('footer');
    const barre = document.querySelector('[data-testid="bottom-tab-bar"]');
    if (!pied) return { erreur: 'pied de page introuvable' as const };
    const p = pied.getBoundingClientRect();
    const b = barre?.getBoundingClientRect();
    const visible = !!barre && !!b && b.height > 0 && getComputedStyle(barre).display !== 'none';
    return {
      erreur: null,
      basPied: Math.round(p.bottom * 10) / 10,
      hautBarre: visible && b ? Math.round(b.top * 10) / 10 : null,
      hauteurFenetre: window.innerHeight,
      defile: document.documentElement.scrollHeight - window.innerHeight,
    };
  });
}

test.describe('coquille v3 — défilée : le rail collé, le pied de page posé', () => {
  test.skip(!admin, 'Needs a local Supabase (E2E_SUPABASE_READY=1).');
  test.setTimeout(180_000);

  let user: Seme | null = null;

  test.beforeAll(async () => {
    if (!admin) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    if (!url.includes('127.0.0.1')) {
      throw new Error(
        `Refus: cette spec ÉCRIT (un ménage fictif complet) et NEXT_PUBLIC_SUPABASE_URL=${url} ` +
          `ne contient pas 127.0.0.1. Lance-la contre la pile locale.`,
      );
    }
    user = await semerCockpit(admin);
  });

  test.afterAll(async () => {
    if (admin && user) await deleteSeededUser(admin, user.userId);
  });

  test('à 1440, le rail reste collé sous l’en-tête en bas de page, repli ouvert ou fermé', async ({
    page,
  }) => {
    if (!user) return;
    await page.setViewportSize({ width: 1440, height: 900 });
    await seConnecter(page, user);

    const etapes: [string, Awaited<ReturnType<typeof lireRail>>][] = [];

    await enBas(page);
    etapes.push(['défilé en bas, replis fermés', await lireRail(page)]);

    await ouvrirRepli(page, 'repli-comptes');
    await enBas(page);
    etapes.push(['défilé en bas, un repli ouvert', await lireRail(page)]);

    await page.getByTestId('repli-comptes').locator('[data-repli-tete]').click();
    await enBas(page);
    etapes.push(['défilé en bas, repli refermé', await lireRail(page)]);

    const rapport = JSON.stringify(etapes, null, 1);
    for (const [nom, e] of etapes) {
      expect(e.erreur, `${nom} : sonde sans cible`).toBeNull();
      if (e.erreur) continue;
      expect(
        e.scrollY,
        `${nom} : la page doit défiler pour que le test prouve quelque chose`,
      ).toBeGreaterThan(0);
      expect(
        Math.abs(e.hautRail - e.basEntete),
        `${nom} : le rail n'est pas collé sous l'en-tête\n${rapport}`,
      ).toBeLessThanOrEqual(TOLERANCE);
      expect(
        e.hautLien,
        `${nom} : le premier lien passe sous l'en-tête\n${rapport}`,
      ).toBeGreaterThanOrEqual(e.basEntete - TOLERANCE);
      expect(e.lienAtteignable, `${nom} : le premier lien est couvert\n${rapport}`).toBe(true);
    }
  });

  for (const vue of [
    { width: 375, height: 812 },
    { width: 500, height: 1000 },
  ]) {
    for (const [nom, route] of [
      ['longue (cockpit)', '/app'],
      ['courte (engagements)', '/app/commitments'],
    ] as const) {
      test(`à ${vue.width}, page ${nom} : le bas du pied de page est le haut de la barre basse`, async ({
        page,
      }) => {
        if (!user) return;
        await page.setViewportSize(vue);
        await seConnecter(page, user);
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        await enBas(page);

        const m = await lirePied(page);
        expect(m.erreur).toBeNull();
        if (m.erreur) return;
        expect(m.hautBarre, 'la barre basse doit être visible sous 1024').not.toBeNull();
        if (m.hautBarre === null) return;

        // Ni dessous (coupé par la barre), ni au-dessus (un vide entre eux).
        expect(
          Math.abs(m.basPied - m.hautBarre),
          `pied de page ${m.basPied} contre barre ${m.hautBarre} (fenêtre ${m.hauteurFenetre}, défilement ${m.defile})`,
        ).toBeLessThanOrEqual(TOLERANCE);

        // La garde de chaque cas : une page dite longue doit l'être, une page dite
        // courte ne doit pas défiler du tout. Sans elle, « le pied de page touche
        // la barre » resterait vrai après que la page ait grandi — et ne prouverait
        // plus rien sur le vide.
        if (route === '/app') {
          expect(m.defile, 'le cockpit doit être une page longue').toBeGreaterThan(200);
        } else {
          expect(m.defile, 'une page courte ne défile pas').toBeLessThanOrEqual(TOLERANCE);
        }
      });
    }
  }

  test('à 1440, sur une page courte, le pied de page touche le bas de la fenêtre', async ({
    page,
  }) => {
    if (!user) return;
    await page.setViewportSize({ width: 1440, height: 1200 });
    await seConnecter(page, user);
    await page.goto('/app/commitments');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await enBas(page);

    const m = await lirePied(page);
    expect(m.erreur).toBeNull();
    if (m.erreur) return;
    expect(m.hautBarre, 'pas de barre basse à 1440').toBeNull();
    // Le rail est haut comme l'écran : la coquille ne doit pas défiler d'un pixel
    // de plus que la fenêtre sur une page courte.
    expect(m.defile, 'une page courte ne défile pas, même au bureau').toBeLessThanOrEqual(0);
    expect(
      Math.abs(m.basPied - m.hauteurFenetre),
      `pied de page ${m.basPied} contre fenêtre ${m.hauteurFenetre}`,
    ).toBeLessThanOrEqual(TOLERANCE);

    const rail = await lireRail(page);
    expect(rail.erreur).toBeNull();
    if (rail.erreur) return;
    expect(Math.abs(rail.hautRail - rail.basEntete)).toBeLessThanOrEqual(TOLERANCE);
  });
});
