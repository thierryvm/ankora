import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();

/**
 * À TOUTE largeur, un utilisateur connecté doit avoir un chemin de navigation
 * **réellement utilisable**, et la page ne doit rien pousser hors de l'écran.
 *
 * ## Pourquoi un e2e et pas un test unitaire
 *
 * La première version de ce contrat lisait les chaînes `className` dans la
 * source et en déduisait des intervalles de visibilité. Sourcery a montré la
 * faille (PR #293) et elle est réelle : la déduction ne connaissait que
 * `hidden` + `*:flex` et `*:hidden`. Un composant passant à `block` ou
 * `inline-flex` serait devenu invisible au test, qui aurait continué à rendre
 * vert. Un garde-fou qui ne couvre qu'un mode de masquage sur trois **ment**.
 *
 * Et surtout : « présent dans le DOM » ne dit rien. La rangée de nav du header
 * était présente, complète, et son bloc voisin dépassait de 155 px hors de
 * l'écran — amputé en silence par `overflow-x: hidden`. Aucune assertion sur du
 * texte source n'aurait pu voir ça.
 *
 * Donc : vrai navigateur, vraies largeurs, géométrie mesurée. Ce fichier ne
 * contient pas un seul nom de classe.
 *
 * ## Ce qui est vérifié à chaque largeur
 *
 *   1. au moins une surface de navigation est visible ET entièrement dans le
 *      viewport — une rangée tronquée ne compte pas ;
 *   2. depuis cette surface, au moins deux destinations de l'app sont
 *      cliquables (un chrome présent mais vide ne navigue nulle part) ;
 *   3. aucun élément interactif ne dépasse le bord du viewport.
 *
 * Les trois défauts rapportés le 2026-08-02 échouent ici, chacun sur son point.
 */

/**
 * Largeurs balayées. Les bornes ± 1 px encadrent chaque point de rupture
 * Tailwind : c'est là que vivent les trous, jamais au milieu d'un palier.
 */
const LARGEURS = [320, 375, 390, 639, 640, 767, 768, 900, 1023, 1024, 1279, 1280, 1440, 1600];

/** Écrans testés : le cockpit a des CTA dans son corps, `/app/settings` n'en a aucun. */
const PAGES = ['/app', '/app/settings'] as const;

type Constat = {
  largeur: number;
  page: string;
  destinationsUtilisables: number;
  debordants: string[];
};

test.describe('navigation atteignable à toute largeur', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  // 2 écrans × 14 largeurs. Le budget par défaut (30 s) suffit en build de
  // production et pas en `next dev`, où la première compilation de chaque route
  // se paie une fois.
  test.setTimeout(180_000);

  test('aucune largeur ne laisse un utilisateur connecté sans navigation utilisable', async ({
    page,
  }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin);

    try {
      await page.setViewportSize({ width: 1600, height: 900 });
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      const constats: Constat[] = [];

      for (const chemin of PAGES) {
        // Une seule navigation par écran, puis on redimensionne. C'est ce que
        // fait un utilisateur — il redimensionne sa fenêtre, il ne recharge pas
        // — et la visibilité du chrome est décidée par des media queries, donc
        // par le viewport, pas par une nouvelle réponse du serveur.
        await page.goto(chemin);
        await page.waitForLoadState('domcontentloaded');

        for (const largeur of LARGEURS) {
          await page.setViewportSize({ width: largeur, height: 900 });
          // Laisse le layout se recalculer ; sans cette attente on mesurerait un
          // état intermédiaire et on accuserait l'application.
          await page.waitForTimeout(150);

          const mesure = await page.evaluate(() => {
            const vw = document.documentElement.clientWidth;

            const visible = (el: Element) => {
              const r = el.getBoundingClientRect();
              if (r.width <= 0 || r.height <= 0) return false;
              const s = getComputedStyle(el);
              return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
            };
            /** Entièrement dans le viewport — une rangée coupée ne compte pas. */
            const entierementVisible = (el: Element) => {
              if (!visible(el)) return false;
              const r = el.getBoundingClientRect();
              return r.left >= -0.5 && r.right <= vw + 0.5;
            };

            // Un chemin de navigation = un lien vers une AUTRE page de l'app,
            // situé dans un conteneur persistant (le header ou un élément fixé).
            // Le corps de page ne compte pas : le cockpit a des CTA, pas
            // `/app/settings`, et les compter masquerait le défaut.
            const chrome = [
              ...document.querySelectorAll('header'),
              ...[...document.querySelectorAll('nav, div')].filter(
                (el) => getComputedStyle(el).position === 'fixed',
              ),
            ];
            const destinations = new Set<string>();
            for (const c of chrome) {
              for (const a of c.querySelectorAll('a[href]')) {
                const href = a.getAttribute('href') ?? '';
                if (!/^\/(fr-BE\/|en\/)?app\/.+/.test(href)) continue;
                if (!entierementVisible(a)) continue;
                destinations.add(href);
              }
            }

            // Débordement : un contrôle POUSSÉ hors du bord droit, ou coupé par
            // celui de gauche. Deux exclusions, chacune motivée :
            //
            //  - `pointer-events: none` — halos décoratifs. Ils débordent par
            //    construction et ne sont atteignables par personne, donc leur
            //    débordement ne prive personne de rien.
            //  - une boîte ENTIÈREMENT à gauche du viewport (`right <= 0`) —
            //    c'est l'idiome du lien d'évitement « Aller au contenu
            //    principal », rangé hors écran jusqu'à ce qu'il reçoive le
            //    focus. Le signaler ferait échouer ce test sur un motif
            //    d'accessibilité correct.
            //
            // Ce qui reste est exactement le défaut cherché : quelque chose qui
            // commence à l'écran et se termine dehors.
            const debordants: string[] = [];
            for (const el of document.querySelectorAll('a[href], button, input, select')) {
              if (!visible(el)) continue;
              if (getComputedStyle(el).pointerEvents === 'none') continue;
              const r = el.getBoundingClientRect();
              if (r.right <= 0.5) continue;
              if (r.right > vw + 0.5 || r.left < -0.5) {
                const nom =
                  el.getAttribute('data-testid') ??
                  el.getAttribute('aria-label') ??
                  (el.textContent ?? '').trim().slice(0, 30) ??
                  el.tagName;
                debordants.push(`${nom} (déborde de ${Math.round(r.right - vw)}px)`);
              }
            }

            return { destinations: [...destinations], debordants };
          });

          constats.push({
            largeur,
            page: chemin,
            destinationsUtilisables: mesure.destinations.length,
            debordants: mesure.debordants,
          });
        }
      }

      const sansNavigation = constats.filter((c) => c.destinationsUtilisables < 2);
      expect(
        sansNavigation.map((c) => `${c.page} @ ${c.largeur}px → ${c.destinationsUtilisables}`),
        'largeurs où un utilisateur connecté ne peut atteindre aucune navigation utilisable',
      ).toEqual([]);

      const avecDebordement = constats.filter((c) => c.debordants.length > 0);
      expect(
        avecDebordement.map((c) => `${c.page} @ ${c.largeur}px → ${c.debordants.join(', ')}`),
        'contrôles poussés hors du viewport — invisibles car html/body portent overflow-x: hidden',
      ).toEqual([]);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
