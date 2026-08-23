import { test, expect } from './fixtures/mobile-test';

/**
 * Le déclencheur du menu doit être ATTEIGNABLE, pas seulement présent.
 *
 * Mesuré en production le 2026-08-23 : sur `/faq`, `/glossaire` et les pages
 * légales — toutes celles qui rendent `Header` — le groupe d'actions n'avait
 * aucune règle responsive. Il atteignait 297 px de large, son bord droit
 * tombait à x=461 quel que soit le viewport, et `HeaderNav` étant le DERNIER
 * élément du groupe, c'est lui qui sortait en premier :
 *
 *     iPhone SE  320 : menu visible 0/40 px
 *     iPhone 14  390 : menu visible 0/40 px
 *     15 Pro Max 430 : menu visible 9/40 px
 *
 * Et comme le `<nav>` de ces pages est `hidden lg:flex`, il ne restait AUCUN
 * chemin de navigation sous 1024 px. La `BottomTabBar` ne sauve rien : elle est
 * absente pour un visiteur anonyme.
 *
 * Deux assertions, et la seconde est celle qui compte. `toBeVisible()` répond
 * vrai pour un élément peint hors du viewport : c'est exactement l'état qu'on
 * corrige ici, donc un test qui s'en contenterait serait vert sur le défaut.
 * `elementFromPoint` au centre du bouton dit ce qu'un DOIGT touche réellement.
 *
 * Le débordement est mesuré sur `body.scrollWidth`, jamais sur
 * `documentElement.scrollWidth` : sous `overflow-x: clip`, le second est aveugle
 * (#344, falsifié à l'époque en injectant un élément 200 px trop large).
 */
const PAGES = ['/faq', '/glossaire', '/legal/cgu'];

test.describe('En-tête — le menu mobile reste atteignable', () => {
  for (const route of PAGES) {
    test(`${route} : le déclencheur du menu est touchable et rien ne déborde`, async ({
      page,
    }, testInfo) => {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');

      const trigger = page.getByTestId('header-nav-trigger');
      await expect(trigger).toBeVisible();

      const verdict = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="header-nav-trigger"]');
        if (!el) return { trouve: false } as const;
        const b = el.getBoundingClientRect();
        const cw = document.documentElement.clientWidth;
        const cx = b.left + b.width / 2;
        const cy = b.top + b.height / 2;
        // `elementFromPoint` rend `null` hors viewport — c'est le cas qu'on veut
        // attraper, pas une panne de sonde.
        const dessus = cx >= 0 && cx <= cw ? document.elementFromPoint(cx, cy) : null;
        return {
          trouve: true,
          touchable: !!dessus && (el === dessus || el.contains(dessus)),
          rect: `x ${Math.round(b.left)}..${Math.round(b.right)}`,
          clientWidth: cw,
          debordement: document.body.scrollWidth - cw,
          recoitLeClic: dessus ? dessus.tagName.toLowerCase() : 'rien (hors viewport)',
        } as const;
      });

      expect(verdict.trouve, 'le déclencheur du menu doit exister').toBe(true);
      if (!verdict.trouve) return;

      expect(
        verdict.touchable,
        `${testInfo.project.name} — le menu est à ${verdict.rect} pour un viewport de ${verdict.clientWidth} px ; le clic atterrit sur « ${verdict.recoitLeClic} »`,
      ).toBe(true);

      expect(
        verdict.debordement,
        `${testInfo.project.name} — débordement horizontal de ${verdict.debordement} px sur ${route}`,
      ).toBeLessThanOrEqual(1);
    });
  }
});
