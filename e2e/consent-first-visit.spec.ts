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

/**
 * Ce que reçoit réellement un doigt au centre d'une case à cocher.
 *
 * Le centre de l'INPUT, pas du label : c'est la mesure la plus stricte, et
 * c'est celle qui a rendu « Personnaliser » le 10 août (#348).
 */
async function cibleAtteignable(
  page: Page,
  nom: string,
): Promise<{ ok: boolean; recoit: string | null; rect: string }> {
  return page.evaluate((n) => {
    const input = document.querySelector(`input[name="${n}"]`);
    if (!input) return { ok: false, recoit: 'case introuvable', rect: '' };
    const r = input.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const label = input.closest('label');
    return {
      ok: Boolean(top && (top === input || label?.contains(top))),
      // Le texte autant que la balise : « button » ne dit pas lequel, et c'est
      // le libellé qui a nommé « Personnaliser » dans le rapport d'origine.
      recoit: top
        ? `${top.tagName.toLowerCase()}:${(top.textContent ?? '').trim().slice(0, 24)}`
        : null,
      rect: `y=${Math.round(r.top)}..${Math.round(r.bottom)} vp=${window.innerHeight}`,
    };
  }, nom);
}

/**
 * Rejoue `mesure` jusqu'à ce qu'elle rende `ok`, et RETOURNE la dernière mesure.
 *
 * `expect.poll(...)` ne convient pas ici : son `message` est une chaîne
 * construite AVANT que la boucle ne tourne, donc il rapporte la valeur initiale
 * — « le clic est reçu par null » alors que rien n'a encore été mesuré. Un
 * message d'échec qui invente sa propre donnée envoie chercher au mauvais
 * endroit, et c'est ce qui coûte une session.
 */
async function attendreMesure<T extends { ok: boolean }>(
  avant: () => Promise<void>,
  mesure: () => Promise<T>,
  timeoutMs = 5_000,
): Promise<T> {
  const fin = Date.now() + timeoutMs;
  let dernier = await (async () => {
    await avant();
    return mesure();
  })();
  while (!dernier.ok && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 200));
    await avant();
    dernier = await mesure();
  }
  return dernier;
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

  /**
   * L'inscription, et non plus seulement la connexion.
   *
   * Le formulaire de `/signup` est BEAUCOUP plus long que celui de `/login` :
   * email, mot de passe, confirmation, deux cases à cocher obligatoires, bouton.
   * Le correctif du 31 juillet — la réserve `--consent-height` en
   * `padding-bottom` sur `body` — rend la page défilable ; ce qu'il ne dit pas,
   * c'est si le bas du formulaire redevient réellement atteignable une fois
   * défilé. C'est la seule question qui compte : on ne s'inscrit pas sans
   * cocher.
   *
   * Mesuré à l'arrivée le 10 août (#348) : `elementFromPoint` au centre de la
   * case « J'accepte les CGU » renvoyait le bouton « Personnaliser » de la
   * bannière. Ce test dit si le geste naturel — faire défiler — suffit.
   */
  test('la bannière ne rend jamais les cases obligatoires de /signup inatteignables', async ({
    page,
  }) => {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.context().clearCookies();
      await page.goto('/signup');
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();

      const banniere = page.locator('[role="dialog"][aria-labelledby="consent-title"]');
      await expect(
        banniere,
        `${vp.nom} — la bannière doit s'afficher en première visite`,
      ).toBeVisible();

      for (const nom of ['acceptTos', 'acceptPrivacy'] as const) {
        // `block: 'start'`, comme le test de connexion, et pour la même raison
        // mesurée : la bannière occupe le BAS de l'écran, donc centrer la cible
        // la place exactement dessous. À 320×568 la case atterrissait en
        // y=276..292 et le clic était reçu par le corps de la bannière.
        //
        // C'est aussi le geste réel : on fait défiler jusqu'à amener en HAUT ce
        // qu'on veut toucher. La question posée par ce test n'est pas « est-ce
        // atteignable sans rien faire » — c'est « existe-t-il une position de
        // défilement où ça l'est ». Si la réponse est non, la page est
        // infranchissable ; c'était le cas de « Se connecter » avant le
        // 31 juillet, faute de toute marge de défilement.
        const d = await attendreMesure(
          async () => {
            await page.evaluate((n) => {
              document
                .querySelector(`input[name="${n}"]`)
                ?.scrollIntoView({ block: 'start', behavior: 'instant' });
            }, nom);
          },
          () => cibleAtteignable(page, nom),
        );
        expect(
          d.ok,
          `${vp.nom} (${vp.width}×${vp.height}) — case « ${nom} » : ` +
            `le clic est reçu par « ${d.recoit} », rect ${d.rect}`,
        ).toBe(true);
      }

      // Et le bouton, qui est encore plus bas que les deux cases.
      const soumission = await attendreMesure(
        async () => {
          await page.evaluate(() => {
            document
              .querySelector('form button[type="submit"]')
              ?.scrollIntoView({ block: 'start', behavior: 'instant' });
          });
        },
        async () =>
          page.evaluate(() => {
            const btn = document.querySelector('form button[type="submit"]');
            if (!btn) return { ok: false, recoit: 'bouton introuvable', rect: '' };
            const r = btn.getBoundingClientRect();
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return {
              ok: Boolean(top && (top === btn || btn.contains(top))),
              recoit: top ? top.tagName.toLowerCase() : null,
              rect: `y=${Math.round(r.top)}..${Math.round(r.bottom)} vp=${window.innerHeight}`,
            };
          }),
      );
      expect(
        soumission.ok,
        `${vp.nom} — bouton d'inscription : reçu par « ${soumission.recoit} », ${soumission.rect}`,
      ).toBe(true);
    }
  });

  /**
   * WCAG 2.2 AA · 2.5.8 — cible de pointage 24 × 24 px minimum.
   *
   * Ce ne sont pas des liens en ligne : l'exception ne s'applique pas. Mesuré
   * 308 × 20 px le 10 août — la largeur allait, la HAUTEUR non, et c'est la
   * hauteur qui rate un doigt.
   *
   * La cible mesurée est le `<label>`, parce que c'est ce qu'un doigt vise : la
   * case elle-même ne fait que 16 × 16, et cliquer le label bascule la case.
   */
  test('les cases obligatoires de /signup respectent la cible de 24 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await page.goto('/signup');

    const tailles = await page.evaluate(() =>
      ['acceptTos', 'acceptPrivacy'].map((n) => {
        const input = document.querySelector(`input[name="${n}"]`);
        const label = input?.closest('label');
        const r = label?.getBoundingClientRect();
        return { nom: n, w: Math.round(r?.width ?? 0), h: Math.round(r?.height ?? 0) };
      }),
    );

    for (const t of tailles) {
      expect(t.w, `« ${t.nom} » — largeur de cible`).toBeGreaterThanOrEqual(24);
      expect(t.h, `« ${t.nom} » — hauteur de cible (mesurée ${t.h} px)`).toBeGreaterThanOrEqual(24);
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
