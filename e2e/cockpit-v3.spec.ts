/**
 * cockpit-v3.spec.ts — le budget de page du cockpit v3, MESURÉ.
 *
 * `src/app/[locale]/app/page.tsx` et `src/components/cockpit/Repli.tsx` citent
 * tous deux « la spec e2e » comme l'instrument de leurs promesses. Ce fichier
 * est cette spec : sans lui, les deux commentaires étaient des intentions.
 *
 * Ce qui est mesuré à 375 px, sur une page RÉELLEMENT servie, avec un compte
 * dont les données sont fictives mais réalistes (une douzaine de factures
 * mensuelles, trois non mensuelles dont une à moins de 60 jours, un engagement,
 * une dizaine de dépenses, les trois comptes du modèle) :
 *
 * - les replis naissent FERMÉS ;
 * - douze montants au plus sont lisibles sans un geste ;
 * - deux écrans et demi au plus ;
 * - aucun débordement horizontal ;
 * - toute cible tactile fait 44 px au moins ;
 * - aucun titre de repli n'est tronqué ;
 * - axe ne relève aucune violation WCAG AA.
 *
 * ## Le refus, et pourquoi il est en tête
 *
 * `.env.local` vise la PRODUCTION. Une spec qui sème une douzaine de factures
 * et dix dépenses avant de supprimer le compte doit donc s'assurer qu'elle
 * parle à une pile LOCALE, et échouer bruyamment sinon. L'adresse doit contenir
 * `127.0.0.1` — pas de tolérance, pas de valeur par défaut.
 */
// La fixture partagée, et non le `test` de base : elle pose le consentement
// comme déjà donné, sinon la barre fixe du bas intercepte les clics ET fausse
// la hauteur mesurée. Le cas du nouvel arrivant est couvert ailleurs, par
// `consent-first-visit.spec.ts`, qui importe délibérément le `test` de base.
import { test, expect } from './helpers/test';
import type { Page } from '@playwright/test';

import { adminClientOrNull, deleteSeededUser } from './helpers/seed';
import { semerCockpit } from './helpers/semis-cockpit';
import type { Seme } from './helpers/semis-cockpit';
import { expectA11yPass } from './helpers/a11y';

const admin = adminClientOrNull();

/** Le budget écrit dans le commentaire de `page.tsx`. */
const BUDGET_MONTANTS = 12;
const BUDGET_ECRANS = 2.5;
/** La cible tactile minimale (WCAG 2.5.5 AAA, et la règle du design system). */
const CIBLE_MIN_PX = 44;

const VUE = { width: 375, height: 812 } as const;

async function seConnecter(page: Page, user: Seme): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Mot de passe').fill(user.password);
  await page.getByRole('button', { name: /^se connecter$/i }).click();
  await page.waitForURL(/\/app\b/, { timeout: 20_000 });
  await expect(page.getByTestId('cockpit-il-te-reste')).toBeVisible();
}

test.use({ viewport: VUE });

test.describe.serial('Cockpit v3 — le budget de page à 375 px', () => {
  test.skip(!admin, 'Needs a local Supabase (E2E_SUPABASE_READY=1).');

  let user: Seme | null = null;

  test.beforeAll(async () => {
    if (!admin) return;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    if (!url.includes('127.0.0.1')) {
      throw new Error(
        `Refus: cette spec ÉCRIT (douze factures, dix dépenses, un compte) et NEXT_PUBLIC_SUPABASE_URL=${url} ` +
          "n'est pas une pile locale. Elle ne tourne que contre 127.0.0.1.",
      );
    }

    user = await semerCockpit(admin);
  });

  test.afterAll(async () => {
    if (admin && user) await deleteSeededUser(admin, user.userId);
  });

  test('les replis naissent fermés, et leur titre tient sur une ligne', async ({ page }) => {
    if (!admin || !user) return;
    await seConnecter(page, user);

    const etats = await page.locator('[data-repli-tete]').evaluateAll((els) =>
      els.map((el) => {
        const titre = el.querySelector('span');
        return {
          texte: (el.textContent ?? '').trim().slice(0, 40),
          ouvert: el.getAttribute('aria-expanded') === 'true',
          // Un titre tronqué (`truncate`) rend le repli illisible : on compare
          // la largeur du contenu à celle de la boîte.
          tronque: titre ? titre.scrollWidth > titre.clientWidth + 1 : false,
        };
      }),
    );

    expect(
      etats.length,
      'aucun repli trouvé — la page mesurée n’est pas le cockpit v3',
    ).toBeGreaterThan(0);
    expect(
      etats.filter((e) => e.ouvert),
      `des replis sont ouverts au chargement: ${JSON.stringify(etats.filter((e) => e.ouvert))}`,
    ).toEqual([]);
    expect(
      etats.filter((e) => e.tronque),
      `des titres de replis sont tronqués: ${JSON.stringify(etats.filter((e) => e.tronque))}`,
    ).toEqual([]);
  });

  test('douze montants au plus sans un geste, et deux écrans et demi au plus', async ({ page }) => {
    if (!admin || !user) return;
    await seConnecter(page, user);

    const mesure = await page.evaluate(() => {
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      // Un montant « sans geste » : affiché au chargement, sans qu'il ait fallu
      // ouvrir quoi que ce soit. Les clés de repli en font partie dès qu'elles
      // portent une somme — elles sont lues comme des chiffres de la page.
      const montants = [...document.querySelectorAll('[data-montant]')].filter(visible);
      const cles = [...document.querySelectorAll('[data-repli-cle]')].filter(
        (el) => visible(el) && /[€]/u.test(el.textContent ?? ''),
      );
      return {
        montants: montants.length + cles.length,
        detail: [...montants, ...cles].map((el) => (el.textContent ?? '').trim()),
        hauteur: document.documentElement.scrollHeight,
        vue: window.innerHeight,
        debordement: document.body.scrollWidth - document.documentElement.clientWidth,
      };
    });

    expect(
      mesure.montants,
      `montants lisibles sans geste: ${JSON.stringify(mesure.detail)}`,
    ).toBeLessThanOrEqual(BUDGET_MONTANTS);

    const ecrans = mesure.hauteur / mesure.vue;
    expect(
      Number(ecrans.toFixed(2)),
      `hauteur ${mesure.hauteur} px pour une vue de ${mesure.vue} px`,
    ).toBeLessThanOrEqual(BUDGET_ECRANS);

    expect(mesure.debordement, 'débordement horizontal à 375 px').toBeLessThanOrEqual(1);
  });

  test('toute cible tactile de la page fait 44 px au moins', async ({ page }) => {
    if (!admin || !user) return;
    await seConnecter(page, user);

    const trop_petites = await page.locator('main a, main button').evaluateAll(
      (els, min) =>
        els
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              texte: (el.textContent ?? '').trim().slice(0, 40),
              hauteur: Math.round(r.height),
              largeur: Math.round(r.width),
              visible: r.width > 0 && r.height > 0,
            };
          })
          // Un élément masqué (replié) n'est pas une cible : il ne se touche pas.
          .filter((c) => c.visible && (c.hauteur < min || c.largeur < min)),
      CIBLE_MIN_PX,
    );

    expect(trop_petites, `cibles sous ${CIBLE_MIN_PX} px: ${JSON.stringify(trop_petites)}`).toEqual(
      [],
    );
  });

  test('axe ne relève aucune violation WCAG AA sur le cockpit', async ({ page }) => {
    if (!admin || !user) return;
    await seConnecter(page, user);

    await expectA11yPass(page);
  });
});
