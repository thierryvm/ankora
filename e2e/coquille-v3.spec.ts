import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();

/**
 * La coquille du socle v3 : barre basse au téléphone, rail au bureau, et
 * JAMAIS les deux.
 *
 * ## Ce que cette spec ajoute à `navigation-reachable.spec.ts`
 *
 * Celle-là vérifie qu'« au moins une » surface de navigation est utilisable à
 * chaque largeur. C'est le bon contrat pour le défaut qu'elle a été écrite
 * pour attraper (un trou), et il est aveugle au défaut inverse : DEUX surfaces
 * à la fois. Or c'est exactement le risque du rail — la barre basse se cachait
 * à 1280, le rail paraît à 1024, et entre les deux seuils on aurait servi les
 * deux. Un utilisateur y aurait vu deux menus disant la même chose, chacun
 * marquant sa page courante de son côté.
 *
 * Ici : EXACTEMENT une. C'est un plancher qui monte, pas un attendu qu'on
 * affaiblit.
 *
 * ## Pourquoi tout se mesure et rien ne se lit dans la source
 *
 * Aucun nom de classe dans ce fichier. La visibilité se décide par media
 * query, donc par le viewport ; une déduction depuis `className` ne connaît
 * qu'une partie des modes de masquage, et elle reste verte quand elle se
 * trompe. `getBoundingClientRect` et `getComputedStyle` ne se trompent pas de
 * la même façon.
 */

/** Les deux seuils qui comptent, et leurs bornes à 1 px près. */
const LARGEURS_NAV = [320, 375, 768, 1023, 1024, 1279, 1280, 1440] as const;

/** Chaque route de `/app`, telle que le registre les déclare. */
const ROUTES_APP = [
  '/app',
  '/app/charges',
  '/app/expenses',
  '/app/commitments',
  '/app/accounts',
  '/app/settings',
] as const;

const PAGES_PUBLIQUES = ['/', '/faq', '/login'] as const;

/** Le plancher tactile d'Apple et de WCAG 2.5.5, en pixels CSS. */
const CIBLE_MINIMALE = 44;

/**
 * Compte les surfaces de navigation de l'app VISIBLES, à la largeur courante.
 *
 * Une surface compte si elle est rendue, non masquée, et si elle porte au
 * moins deux liens vers des routes de `/app` : un chrome présent mais vide ne
 * navigue nulle part, et le compter reviendrait à se rassurer.
 */
async function surfacesDeNavVisibles(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    };

    const surfaces: string[] = [];
    for (const nav of Array.from(document.querySelectorAll('nav'))) {
      if (!visible(nav)) continue;
      const liens = Array.from(nav.querySelectorAll('a[href], button[data-testid]')).filter(
        (el) =>
          visible(el) &&
          (el.getAttribute('href')?.includes('/app') ||
            el.getAttribute('data-testid')?.startsWith('bottom-tab-')),
      );
      if (liens.length >= 2) {
        surfaces.push(
          nav.getAttribute('data-testid') ?? nav.getAttribute('aria-label') ?? 'nav sans nom',
        );
      }
    }
    return surfaces;
  });
}

/** Tout élément qui déborde horizontalement du viewport, décrit lisiblement. */
async function debordements(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const dehors: string[] = [];

    // Le defilement horizontal de la PAGE : c'est le symptome que quelqu'un
    // voit. Il se mesure en un chiffre, et il ne se confond pas avec un
    // debordement d'element.
    if (document.documentElement.scrollWidth > vw + 1) {
      dehors.push(
        `la page defile horizontalement : scrollWidth ${document.documentElement.scrollWidth} > ${vw}`,
      );
    }

    // Puis les elements, mais seulement ceux avec lesquels on INTERAGIT.
    //
    // La premiere version de ce cas balayait tout le DOM, et elle a trouve un
    // `div.pointer-events-none.absolute.-right-16.-bottom-16` : un halo
    // decoratif, pose exprès en dehors de sa carte, anterieur a ce lot. Il
    // deborde du viewport sans rien deplacer, sans rien masquer, et sans
    // rendre la page defilante (le corps le rogne). Le signaler etait mesurer
    // plus strict que le critere, et un cas qui rougit sur une decoration
    // finit ignore — donc inutile le jour ou il a raison.
    //
    // Ce qui compte est intact, et c'est la classe de defaut du 31 juillet :
    // un CONTROLE pousse hors de l'ecran est un controle inaccessible.
    const interactifs = 'a[href], button, input, select, textarea, [role="button"], [tabindex]';
    for (const el of Array.from(document.body.querySelectorAll(interactifs))) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      if (s.pointerEvents === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      // 1 px de tolérance : les bords sub-pixel d'un zoom de rendu ne sont pas
      // un débordement, et les traiter comme tel rendrait la spec instable —
      // c'est-à-dire ignorée.
      if (r.right > vw + 1 || r.left < -1) {
        // Le nom SEUL ne suffit pas à retrouver le coupable : « div » ne dit
        // rien à qui lit le rapport, et il faut alors refaire la mesure à la
        // main. Le message porte donc la chaîne de classes et la position
        // calculée — de quoi ouvrir le bon fichier du premier coup.
        const nom = el.tagName.toLowerCase();
        const marque = el.getAttribute('data-testid') ?? el.getAttribute('aria-label') ?? '';
        const classes =
          typeof el.className === 'string'
            ? el.className.trim().split(/\s+/).slice(0, 6).join('.')
            : '';
        dehors.push(
          `${nom}${marque ? `[${marque}]` : ''}${classes ? `.${classes}` : ''} (${s.position}) → ${Math.round(r.left)}…${Math.round(r.right)} / ${vw}`,
        );
      }
    }
    // Un parent qui déborde entraîne tous ses enfants : on ne garde que les
    // premiers, sinon le message est illisible et personne ne le lit.
    return dehors.slice(0, 8);
  });
}

test.describe('coquille v3 — une seule surface de navigation par largeur', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');
  test.setTimeout(180_000);

  test('la barre basse et le rail ne coexistent jamais, et il y en a toujours une', async ({
    page,
  }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin);

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      const constats: { largeur: number; surfaces: string[] }[] = [];

      await page.goto('/app');
      await page.waitForLoadState('domcontentloaded');

      for (const largeur of LARGEURS_NAV) {
        await page.setViewportSize({ width: largeur, height: 900 });
        await page.waitForTimeout(150);
        constats.push({ largeur, surfaces: await surfacesDeNavVisibles(page) });
      }

      const fautives = constats.filter((c) => c.surfaces.length !== 1);
      expect(
        fautives,
        `largeurs sans exactement une surface de navigation : ${fautives
          .map(
            (c) => `${c.largeur}px → ${c.surfaces.length} (${c.surfaces.join(', ') || 'aucune'})`,
          )
          .join(' | ')}`,
      ).toEqual([]);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('à 375 chaque destination de la barre basse répond, et sa cible fait 44 px', async ({
    page,
  }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin);

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/app');
      await page.waitForLoadState('domcontentloaded');

      const barre = page.getByTestId('bottom-tab-bar');
      await expect(barre).toBeVisible();

      // La cible, pas la peinture. Un onglet peut être dessiné plus petit que
      // ce qu'il accepte au doigt — c'est la boîte du contrôle qui compte.
      const trop_petites = await barre.evaluate((nav, plancher) => {
        const petites: string[] = [];
        for (const el of Array.from(nav.querySelectorAll('a, button'))) {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          if (r.height < plancher || r.width < plancher) {
            petites.push(
              `${el.getAttribute('data-testid') ?? el.textContent?.trim() ?? '?'} → ${Math.round(r.width)}×${Math.round(r.height)}`,
            );
          }
        }
        return petites;
      }, CIBLE_MINIMALE);

      expect(
        trop_petites,
        `cibles sous ${CIBLE_MINIMALE} px : ${trop_petites.join(' | ')}`,
      ).toEqual([]);

      // Chaque destination RÉPOND : on la touche et l'URL change. « Présente
      // dans le DOM » ne dit rien — un lien recouvert par une barre fixe est
      // présent, visible, et inerte. C'est le défaut du 31 juillet, et il a
      // coûté un bug bloquant en production.
      for (const id of ['bottom-tab-bills', 'bottom-tab-expenses']) {
        await page.goto('/app');
        await page.waitForLoadState('domcontentloaded');
        await page.getByTestId(id).click();
        await page.waitForURL(/\/app\/(charges|expenses)\b/, { timeout: 10_000 });
      }

      // Le clavier : le focus doit se VOIR. Un anneau de 0 px est un anneau
      // absent, et personne ne s'en aperçoit en cliquant.
      await page.goto('/app');
      await page.waitForLoadState('domcontentloaded');
      const anneau = await page.evaluate(() => {
        const cible = document.querySelector<HTMLElement>('[data-testid="bottom-tab-bills"]');
        if (!cible) return null;
        cible.focus();
        const s = getComputedStyle(cible);
        return {
          contour: Number.parseFloat(s.outlineWidth || '0'),
          ombre: s.boxShadow,
          style: s.outlineStyle,
        };
      });

      expect(anneau, 'la destination « Factures » est introuvable dans la barre').not.toBeNull();
      const marqueDeFocus =
        (anneau!.contour > 0 && anneau!.style !== 'none') ||
        (anneau!.ombre !== 'none' && anneau!.ombre !== '');
      expect(marqueDeFocus, `focus sans marque visible : ${JSON.stringify(anneau)}`).toBe(true);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('aucune route de /app ne déborde horizontalement, à 375 ni à 1440', async ({ page }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin);

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      const fautes: string[] = [];

      for (const largeur of [375, 1440]) {
        await page.setViewportSize({ width: largeur, height: 900 });
        for (const route of ROUTES_APP) {
          await page.goto(route);
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(150);
          for (const faute of await debordements(page)) {
            fautes.push(`${route} @ ${largeur} : ${faute}`);
          }
        }
      }

      expect(fautes, `débordements :\n${fautes.join('\n')}`).toEqual([]);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});

test.describe('coquille v3 — les pages publiques ne débordent pas non plus', () => {
  test.setTimeout(120_000);

  test('à 375, aucune page publique ne pousse quoi que ce soit hors de l’écran', async ({
    page,
  }) => {
    const fautes: string[] = [];

    await page.setViewportSize({ width: 375, height: 812 });
    for (const route of PAGES_PUBLIQUES) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(150);
      for (const faute of await debordements(page)) {
        fautes.push(`${route} : ${faute}`);
      }
    }

    expect(fautes, `débordements :\n${fautes.join('\n')}`).toEqual([]);
  });
});
