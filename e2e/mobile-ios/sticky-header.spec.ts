/**
 * sticky-header.spec.ts — the header must still be there after scrolling.
 *
 * Reported by @thierry on real iPhone hardware, 9 August 2026: on the landing
 * page the top bar scrolled away with the page, and page content then slid
 * under the iOS status bar, making the clock unreadable. Four CI gates and two
 * AI reviews had been green throughout.
 *
 * Root cause, measured: `html, body { overflow-x: hidden }` in globals.css.
 * CSS Overflow 3 promotes the other axis from `visible` to `auto` when one axis
 * is neither `visible` nor `clip` — so both elements became scroll containers,
 * and every `position: sticky` descendant resolved its scrollport to <body>,
 * which does not itself scroll. Three headers were inert for three months:
 * MktNav (landing), Header (other public pages), AdminTopbar (admin).
 *
 * WHY THIS TEST DID NOT EXIST BEFORE, and why its shape matters: `sticky` was
 * declared in the markup, so every source-reading check saw it and agreed. Only
 * scrolling a real engine can tell a declared mechanism from a working one.
 * This spec therefore asserts GEOMETRY AFTER MOTION — never a class name, never
 * a computed `position` value, both of which stayed correct while the header
 * was inert.
 *
 * Fixture: imports the shared `./fixtures/mobile-test`, which pre-seeds the
 * consent banner as dismissed. Stated rather than assumed (cf. CLAUDE.md, « Un
 * harnais ment aussi par l'état qu'il installe ») : the banner is `fixed
 * bottom-4`, so it cannot influence an element pinned to the TOP of the
 * viewport — and `e2e/consent-first-visit.spec.ts` already covers the
 * un-seeded world. If this spec ever starts measuring bottom-anchored chrome,
 * that reasoning stops holding and must be revisited.
 */

import { test, expect } from './fixtures/mobile-test';

/**
 * Distance scrolled before measuring — a fixed value on purpose, not derived
 * from document height.
 *
 * Deriving it would make the test adapt silently to a page that shrank, and a
 * page too short to scroll cannot prove anything about a sticky header. The
 * fixed value plus the `scrollY > 200` guard below means such a page makes this
 * spec FAIL, loudly, saying the measurement would prove nothing — which is the
 * outcome we want. 900px is well past every header height on this site, and far
 * below the shortest page it runs against.
 */
const DEFILEMENT = 900;

/**
 * Public routes that carry a `sticky top-0` header, one per component, so a
 * regression in either is caught: `/` renders <MktNav>, `/faq` renders
 * <Header>. The admin top bar is behind auth and out of this spec's reach.
 */
const ROUTES = [
  { chemin: '/', composant: 'MktNav' },
  { chemin: '/faq', composant: 'Header' },
] as const;

test.describe('En-tête collant — le menu reste en haut au défilement', () => {
  for (const { chemin, composant } of ROUTES) {
    test(`${chemin} (${composant}) : l'en-tête tient après ${DEFILEMENT}px`, async ({ page }) => {
      await page.goto(chemin);
      await page.waitForLoadState('networkidle');

      const entete = page.locator('header').first();
      await expect(entete).toBeVisible();

      const avant = await entete.boundingBox();
      expect(avant, `aucun <header> mesurable sur ${chemin}`).not.toBeNull();

      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), DEFILEMENT);

      // Attendre la CONDITION, pas une durée (retour Sourcery, 2026-08-10) : un
      // `waitForTimeout` fixe rend le résultat dépendant de la vitesse de la
      // machine. On attend que `scrollY` se stabilise sur deux trames
      // consécutives — la position finale peut être inférieure à la cible si la
      // page est plus courte, et c'est le garde-fou ci-dessous qui tranche.
      await page.waitForFunction(
        () =>
          new Promise((resolve) => {
            requestAnimationFrame(() => {
              const a = window.scrollY;
              requestAnimationFrame(() => resolve(window.scrollY === a));
            });
          }),
        undefined,
        { timeout: 5_000 },
      );

      const defile = await page.evaluate(() => Math.round(window.scrollY));
      // Garde-fou d'instrument : si la page n'a pas défilé, le test ne prouve
      // rien et doit le dire, plutôt que de rendre vert par accident.
      expect(
        defile,
        `la page n'a pas défilé sur ${chemin} (scrollY=${defile}) — la mesure ne prouverait rien`,
      ).toBeGreaterThan(200);

      const apres = await entete.boundingBox();
      expect(apres, `l'en-tête a disparu du rendu après défilement sur ${chemin}`).not.toBeNull();

      // Le seul critère qui compte : le haut de l'en-tête est resté en haut du
      // viewport. Sous le défaut, cette valeur valait -900.
      expect(
        Math.round(apres!.y),
        `${composant} : haut de l'en-tête à ${Math.round(apres!.y)}px après ${defile}px de défilement — il est parti avec la page`,
      ).toBeLessThanOrEqual(1);

      // Et il est toujours visible : un élément replié à zéro hauteur passerait
      // le test précédent sans rien montrer à l'utilisateur.
      expect(apres!.height, `${composant} : en-tête présent mais de hauteur nulle`).toBeGreaterThan(
        20,
      );
    });
  }
});
