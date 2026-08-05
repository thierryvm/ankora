/**
 * PREMIÈRE VISITE — le seul test de la suite qui voit la bannière de consentement.
 *
 * ⚠️ L'import vient de `@playwright/test`, PAS de `./helpers/test`. Ce n'est pas
 * un oubli, c'est tout l'objet du fichier. La fixture partagée pré-remplit
 * `localStorage['ankora.consent.v1']` — et son propre commentaire dit pourquoi :
 *
 *   « Pre-seeds the consent banner as dismissed so tests can click through
 *     without the fixed-position dialog intercepting pointer events. »
 *     (e2e/helpers/test.ts:50)
 *
 * Le contournement écrit pour rendre les tests praticables est exactement ce qui
 * a masqué un bug bloquant en production pendant toute la vie de la suite : la
 * bannière recouvrait « Se connecter » sur TOUS les presets iPhone et
 * interceptait les clics, et 100 % des tests tournaient dans un monde où elle
 * avait déjà été traitée. Un harnais ne ment pas seulement par ce qu'il saute —
 * il ment aussi par l'état qu'il installe avant de regarder.
 *
 * Toute spec ajoutée ici doit donc rester sur le `test` de base. Y brancher la
 * fixture partagée reviendrait à supprimer le test sans le dire.
 *
 * Cf. docs/bugs/2026-07-31-consentement-bloque-login-mobile.md
 */
import { test, expect, type Page } from '@playwright/test';

/**
 * Hauteurs mesurées le 2026-07-31. À 390 px de large le seuil de bascule était
 * entre 780 (bloqué) et 790 (cliquable) ; les trois premières correspondent à
 * des appareils réels, toutes étaient BLOQUÉES avant le correctif.
 */
const VIEWPORTS = [
  { width: 320, height: 568, nom: 'iPhone SE' },
  { width: 390, height: 664, nom: 'iPhone 12 / 14' },
  { width: 430, height: 739, nom: 'iPhone 15 Pro Max' },
  { width: 390, height: 780, nom: 'dernière hauteur mesurée bloquée' },
] as const;

/** Ce que reçoit réellement un clic au centre du bouton. */
async function boutonAtteignable(page: Page): Promise<{ ok: boolean; recoit: string | null }> {
  return page.evaluate(() => {
    const btn = [...document.querySelectorAll('button[type="submit"]')].find((b) =>
      /se connecter/i.test(b.textContent ?? ''),
    );
    if (!btn) return { ok: false, recoit: 'bouton introuvable' };
    const r = btn.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      ok: Boolean(top && (top === btn || btn.contains(top))),
      recoit: top ? `${top.tagName.toLowerCase()}${top.id ? `#${top.id}` : ''}` : null,
    };
  });
}

test.describe('Consentement — première visite, sans état pré-rempli', () => {
  test('la bannière ne rend jamais « Se connecter » inatteignable', async ({ page }) => {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.context().clearCookies();
      await page.goto('/login');
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();

      const banniere = page.locator('[role="dialog"][aria-labelledby="consent-title"]');
      await expect(
        banniere,
        `${vp.nom} — la bannière doit s'afficher en première visite`,
      ).toBeVisible();

      // Un utilisateur fait défiler jusqu'à voir le bouton. Avant le correctif,
      // `body` n'avait AUCUNE marge de défilement (conteneurs `min-h-dvh`) : ce
      // geste ne déplaçait rien et le bouton restait piégé sous la bannière —
      // aucune quantité de nouvelles tentatives n'y changeait quoi que ce soit.
      //
      // `behavior: 'instant'` parce que `html { scroll-behavior: smooth }`
      // (globals.css:451) anime le défilement — sans cela on mesure avant la fin.
      // `block: 'start'` et non le fond de page : à 320×568, aller au fond fait
      // sortir le bouton par le haut du viewport (mesuré : -31→9).
      //
      // La boucle laisse au ResizeObserver de la bannière le temps de publier
      // `--consent-height` après le changement de viewport : la réserve n'est
      // pas posée au premier rendu, elle suit la hauteur réellement occupée.
      let dernier: Awaited<ReturnType<typeof boutonAtteignable>> = { ok: false, recoit: null };
      await expect
        .poll(
          async () => {
            await page.evaluate(() => {
              const btn = [...document.querySelectorAll('button[type="submit"]')].find((b) =>
                /se connecter/i.test(b.textContent ?? ''),
              );
              btn?.scrollIntoView({ block: 'start', behavior: 'instant' });
            });
            dernier = await boutonAtteignable(page);
            return dernier.ok;
          },
          {
            timeout: 5_000,
            message: `${vp.nom} (${vp.width}×${vp.height}) — le bouton reste inatteignable`,
          },
        )
        .toBe(true);
      expect(dernier.recoit, `${vp.nom} — élément sous le centre du bouton`).not.toBe(
        'p#consent-body',
      );

      /*
       * Aucun traceur ne doit s'être chargé — la décision de consentement n'a
       * pas été prise, et la politique cookies publiée promet « Analytics
       * désactivés par défaut ».
       *
       * L'ancrage compte autant que l'assertion. Il est placé APRÈS le poll
       * ci-dessus, et pas après un simple `toBeVisible()` de la bannière :
       * `getServerSnapshot()` rend une décision nulle, donc la bannière est
       * déjà dans le HTML rendu côté serveur et visible AVANT hydratation.
       * Mesurer là passerait pour la mauvaise raison, y compris sur un code
       * défaillant. Le poll, lui, dépend de `--consent-height`, que seul
       * l'effet de la bannière écrit : il ne peut pas réussir sans hydratation.
       */
      const traceurs = await page.evaluate(() => ({
        va: typeof (window as unknown as { va?: unknown }).va,
        si: typeof (window as unknown as { si?: unknown }).si,
      }));
      expect(traceurs, `${vp.nom} — un traceur s'est chargé sans consentement`).toEqual({
        va: 'undefined',
        si: 'undefined',
      });

      // La preuve par l'usage : le parcours réel doit aboutir.
      await page.getByLabel('Email').fill('personne@ankora.test');
      await page.getByLabel('Mot de passe').fill('MauvaisMotDePasse!1');
      await page.getByRole('button', { name: /^se connecter$/i }).click({ timeout: 5_000 });
      // Identifiants invalides : on n'assert pas le message, seulement que le
      // clic a été reçu et que la page a réagi.
      await expect(page.getByRole('button', { name: /^se connecter$/i })).toBeVisible();
    }
  });

  test('« Essentiels uniquement » ferme la bannière et libère la page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await page.goto('/login');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    const banniere = page.locator('[role="dialog"][aria-labelledby="consent-title"]');
    await expect(banniere).toBeVisible();
    await banniere.getByRole('button', { name: /essentiels uniquement/i }).click();
    await expect(banniere).toBeHidden();

    // L'espace réservé doit être rendu : plus de bannière, plus de réserve.
    const reserve = await page.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue('padding-bottom'),
    );
    expect(reserve.trim()).toBe('0px');

    const atteignable = await boutonAtteignable(page);
    expect(atteignable.ok, `le clic est reçu par « ${atteignable.recoit} »`).toBe(true);
  });
});
