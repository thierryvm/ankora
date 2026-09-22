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
  // Tant qu'Inter n'est pas appliquée, la page est rendue dans la police de
  // secours du système (`font-display: swap`) : ses métriques ne sont pas
  // celles qu'un humain verra, et TOUTE mesure de largeur ou de hauteur porte
  // alors sur une page intermédiaire. Sous Windows la substitution est plus
  // étroite qu'Inter, sous Linux plus large — c'est-à-dire que le même code
  // rendait deux verdicts sur deux machines. L'attente supprime la loterie
  // sans rien adoucir : ce qui est mesuré ensuite est la page installée.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
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

  test('les replis naissent fermés, et aucun titre n’est coupé', async ({ page }) => {
    if (!admin || !user) return;
    await seConnecter(page, user);

    const etats = await page.locator('[data-repli-tete]').evaluateAll((els) =>
      els.map((el) => {
        const titre = el.querySelector('span');
        return {
          texte: (el.textContent ?? '').trim().slice(0, 40),
          ouvert: el.getAttribute('aria-expanded') === 'true',
          // Un titre coupé rend le repli illisible. Depuis le 20 septembre 2026
          // le titre passe à la ligne (`line-clamp-2`) au lieu d'être rogné sur
          // une seule : la coupe se mesure donc en HAUTEUR, pas en largeur.
          // Même sévérité, bon axe — un titre qui déborde de deux lignes est
          // amputé exactement comme il l'était en débordant de sa largeur.
          tronque: titre ? titre.scrollHeight > titre.clientHeight + 1 : false,
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

  test('en fin de défilement, le dernier élément reste atteignable au-dessus de la barre', async ({
    page,
  }) => {
    if (!admin || !user) return;
    await seConnecter(page, user);

    // La relecture du 20 septembre 2026 a cru voir la barre d'onglets recouvrir
    // « Bientôt » à 375 px. C'était un artefact de capture PLEINE PAGE : la
    // barre est fixe en bas de la FENÊTRE, donc une image qui déroule tout la
    // recopie au milieu du document. Rien n'est corrigé ; ce cas mesure la
    // seule chose qui compte vraiment — en bas de page, le dernier élément
    // reste visible ET cliquable, c'est-à-dire que le point où le doigt
    // tomberait lui appartient encore.
    // Instantané : la feuille de style pose un défilement lissé, et une mesure
    // prise en cours de route lit le défilement, pas la page.
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
    );
    await page.waitForTimeout(300);

    const verdict = await page.evaluate(() => {
      const cibles = [...document.querySelectorAll('main a, main button')].filter(
        (el) => el.getBoundingClientRect().height > 0,
      );
      const dernier = cibles.at(-1);
      if (!dernier) return { erreur: 'aucune cible dans <main>' as const };
      const r = dernier.getBoundingClientRect();
      // `elementFromPoint` rend `null` hors de la fenêtre : on vérifie d'abord
      // que la boîte y est, sinon la sonde regarderait ailleurs.
      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);
      const dansLaVue = r.top >= 0 && r.bottom <= window.innerHeight;
      const auPoint = dansLaVue ? document.elementFromPoint(x, y) : null;
      return {
        erreur: null,
        texte: (dernier.textContent ?? '').trim().slice(0, 40),
        dansLaVue,
        recouvert: !(auPoint && (auPoint === dernier || dernier.contains(auPoint))),
      };
    });

    expect(verdict.erreur, 'sonde sans cible').toBeNull();
    expect(
      verdict,
      `le dernier élément sort de la fenêtre: ${JSON.stringify(verdict)}`,
    ).toMatchObject({ dansLaVue: true, recouvert: false });

    // Le dernier élément de la PAGE n'est pas celui de <main>. La sonde
    // ci-dessus ne regarde que `main a, main button` : le pied de page vit hors
    // de <main>, et sous la barre d'onglets ses liens sont masqués, donc il
    // n'y a rien à cliquer dedans — la sonde était aveugle à lui par
    // construction, et le pied de page pouvait passer à moitié sous la barre
    // (relevé par @thierry sur la PWA, 21 septembre 2026) sans qu'elle rougisse.
    // Ce qu'on mesure ici est sa BOÎTE : son bas doit être au-dessus de la barre.
    // La mesure exacte (bas du pied = haut de la barre, page longue et courte,
    // 375 et 500) vit dans `coquille-defilement.spec.ts`.
    //
    // Attendu CHANGÉ le 22 septembre 2026 (déclaré dans la PR) : sous 1024, /app
    // n'a plus de pied de page affiché (décision @thierry, option A). La fin de
    // la page est <main> : c'est sa boîte qui doit finir au-dessus de la barre,
    // et le pied de page, présent dans le DOM pour le bureau, ne doit pas
    // s'afficher.
    const pied = await page.evaluate(() => {
      const f = document.querySelector('footer');
      const main = document.querySelector('main');
      const barre = document.querySelector('[data-testid="bottom-tab-bar"]');
      if (!main || !barre) return { erreur: '<main> ou barre introuvable' as const };
      return {
        erreur: null,
        piedAffiche:
          !!f && f.getBoundingClientRect().height > 0 && getComputedStyle(f).display !== 'none',
        basMain: Math.round(main.getBoundingClientRect().bottom),
        hautBarre: Math.round(barre.getBoundingClientRect().top),
      };
    });
    expect(pied.erreur, 'sonde sans cible').toBeNull();
    if (pied.erreur) return;
    expect(pied.piedAffiche, 'un pied de page est affiché sous 1024').toBe(false);
    expect(
      pied.basMain,
      `la fin de la page passe sous la barre : bas ${pied.basMain}, haut de la barre ${pied.hautBarre}`,
    ).toBeLessThanOrEqual(pied.hautBarre + 1);
  });
});
