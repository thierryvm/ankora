/**
 * NAVIGATION UTILISABLE EN PREMIÈRE VISITE — le test qui manquait.
 *
 * ⚠️ L'import vient de `@playwright/test`, PAS de `./helpers/test`. Comme pour
 * `consent-first-visit.spec.ts`, c'est tout l'objet du fichier : la fixture
 * partagée pré-remplit `localStorage['ankora.consent.v1']`, donc aucune spec qui
 * l'utilise ne peut voir un défaut causé par la bannière de consentement.
 * `navigation-reachable.spec.ts` (PR #293) l'utilise — c'est pourquoi elle est
 * restée verte pendant que la navigation était inatteignable en PWA installée.
 *
 * ## Ce que ce fichier vérifie, et que le précédent ne vérifiait pas
 *
 * `navigation-reachable.spec.ts` mesure `getBoundingClientRect` et ne teste que
 * les bords GAUCHE et DROIT. Trois angles morts, tous exploités par ce défaut :
 *
 *   1. **Consentement pré-décidé.** La bannière n'existait dans aucun test.
 *   2. **Bornes verticales absentes.** Une barre poussée sous le bord bas comptait
 *      comme visible.
 *   3. **Présence ≠ atteignabilité.** Un contrôle peut être dans le DOM, visible,
 *      entièrement dans le viewport, et recouvert par un élément `fixed` plus haut
 *      dans la pile. `getBoundingClientRect` ne voit rien. `elementFromPoint` si.
 *
 * Le défaut du 2026-08-03 est exactement le troisième cas : la bannière
 * (`fixed z-50`) se peignait par-dessus la `BottomTabBar` (`fixed z-40`) et
 * interceptait les cinq onglets. La réserve `--consent-height` posée le
 * 2026-07-31 en `padding-bottom` sur `body` ne pouvait pas la protéger : un
 * élément `position: fixed` est hors flux et ignore le padding de son conteneur.
 *
 * ## Ce que ce fichier ne peut PAS faire, et pourquoi
 *
 * `display-mode: standalone` **n'est pas émulable** ici : `Emulation.setEmulatedMedia`
 * avec `features: [{name:'display-mode'}]` est accepté par CDP puis ignoré
 * (`matchMedia('(display-mode: standalone)').matches` reste `false` — vérifié).
 * Ce n'est pas un manque : `display-mode` n'apparaît **nulle part** dans `src/`
 * (0 occurrence), donc aucune règle CSS ni aucune branche JS ne distingue la PWA
 * installée du navigateur. Ce que le mode standalone change réellement, et que ce
 * test reproduit fidèlement, c'est :
 *
 *   - un **stockage vierge** (la PWA installée a son propre bac à sable, donc un
 *     consentement accepté dans Safari n'y a jamais été vu) → `localStorage.clear()`
 *     sur une session déjà authentifiée, ce qui est exactement l'état au lancement ;
 *   - des **zones sûres non nulles** → `Emulation.setSafeAreaInsetsOverride`, qui
 *     fonctionne (mesuré : `env(safe-area-inset-bottom)` passe de 0 à 34 px).
 *     Chromium uniquement ; sous WebKit le test tourne à inset nul, et le défaut
 *     s'y manifestait de la même façon.
 */
import { test, expect, type Page } from '@playwright/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();

/**
 * La fixture partagée donne à chaque test son IP (`x-forwarded-for`) pour que les
 * seaux de `rateLimit('auth')` — 5 tentatives / 15 min — ne soient pas partagés.
 * En important le `test` de base on perd cette isolation : on la repose ici à la
 * main. Sans elle, quelques exécutions successives font répondre « Trop de
 * tentatives », ce qui se lit comme une application cassée.
 */
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '10.203.11.4' } });

/**
 * Zones sûres d'un iPhone 14 en PWA installée, encoche + indicateur d'accueil.
 * C'est le cas qui compte : en standalone `env(safe-area-inset-bottom)` cesse
 * d'être nul et la barre passe de 49 à 83 px de haut.
 */
const INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

const ECRANS = [
  { w: 320, h: 568, nom: 'iPhone SE' },
  { w: 390, h: 844, nom: 'iPhone 14 — le format rapporté par @thierry' },
  { w: 430, h: 932, nom: 'iPhone 15 Pro Max' },
  { w: 900, h: 900, nom: 'bande refermée par la PR #293' },
  { w: 1279, h: 900, nom: 'dernière largeur où la barre est montée' },
  { w: 1280, h: 900, nom: 'première largeur sans barre — la nav header prend le relais' },
] as const;

type Constat = {
  ecran: string;
  banniereAffichee: boolean;
  destinationsAtteignables: number;
  inatteignables: string[];
};

/**
 * Mesure l'atteignabilité RÉELLE du chrome de navigation persistant.
 *
 * « Persistant » = le header, ou tout conteneur `position: fixed`. Le corps de
 * page ne compte pas : le cockpit a des CTA, `/app/settings` n'en a aucun, et les
 * compter masquerait précisément le défaut cherché.
 *
 * Pour chaque destination applicative de ce chrome, on demande au navigateur ce
 * qu'un doigt posé au centre du contrôle toucherait vraiment. Un lien recouvert
 * par un autre élément `fixed` est compté INATTEIGNABLE, avec le nom de ce qui le
 * masque — c'est ce diagnostic-là qui manquait le 2026-08-03.
 */
async function mesurer(page: Page): Promise<Omit<Constat, 'ecran'>> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    };

    /** Entièrement dans le viewport — LES QUATRE bords, pas seulement les côtés. */
    const dansLEcran = (el: Element) => {
      if (!visible(el)) return false;
      const r = el.getBoundingClientRect();
      return r.left >= -0.5 && r.right <= vw + 0.5 && r.top >= -0.5 && r.bottom <= vh + 0.5;
    };

    /** Ce qu'un doigt posé au centre du contrôle toucherait réellement. */
    const quiRecoitLeClic = (el: Element): { ok: boolean; devant: string } => {
      const r = el.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      const dessus = document.elementFromPoint(cx, cy);
      if (!dessus) return { ok: false, devant: 'aucun élément à ce point' };
      if (dessus === el || el.contains(dessus)) return { ok: true, devant: '' };
      // Nommer le masque par son testid le plus proche : lisible dans le rapport
      // d'échec sans avoir à ouvrir une trace.
      const porteur = (dessus as HTMLElement).closest(
        '[data-testid], [role="dialog"], header, nav',
      );
      const nom =
        porteur?.getAttribute('data-testid') ??
        porteur?.getAttribute('aria-labelledby') ??
        porteur?.tagName.toLowerCase() ??
        dessus.tagName.toLowerCase();
      return { ok: false, devant: nom };
    };

    const chrome = [
      ...document.querySelectorAll('header'),
      ...[...document.querySelectorAll('nav, div')].filter(
        (el) => getComputedStyle(el).position === 'fixed',
      ),
    ];

    const atteignables = new Set<string>();
    const inatteignables: string[] = [];
    for (const conteneur of chrome) {
      for (const a of conteneur.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href') ?? '';
        if (!/^\/(fr-BE\/|en\/)?app(\/|$)/.test(href)) continue;
        if (!dansLEcran(a)) continue;
        const verdict = quiRecoitLeClic(a);
        if (verdict.ok) atteignables.add(href);
        else inatteignables.push(`${href} → recouvert par « ${verdict.devant} »`);
      }
    }

    return {
      banniereAffichee: Boolean(
        document.querySelector('[role="dialog"][aria-labelledby="consent-title"]'),
      ),
      destinationsAtteignables: atteignables.size,
      inatteignables: [...new Set(inatteignables)],
    };
  });
}

test.describe('navigation utilisable en première visite (état PWA installée)', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  test.setTimeout(180_000);

  test('la bannière de consentement ne rend jamais la navigation inatteignable', async ({
    page,
    browserName,
  }) => {
    if (!admin) return;

    // Zones sûres non nulles — l'état réel d'une PWA installée sur iPhone.
    // Chromium seulement ; l'override n'existe pas côté WebKit, où le test
    // tourne alors à inset nul (le défaut s'y manifestait identiquement).
    if (browserName === 'chromium') {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets: INSETS } as never);
    }

    const user = await seedOnboardedUser(admin);

    try {
      // 1. Se connecter. On écarte la bannière pour ce seul geste : le parcours de
      //    connexion avec bannière est déjà couvert par `consent-first-visit.spec.ts`,
      //    et ce fichier-ci porte sur ce qui vient APRÈS la connexion.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/login');
      await page
        .locator('[role="dialog"][aria-labelledby="consent-title"]')
        .getByRole('button', { name: /essentiels uniquement/i })
        .click();
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 30_000 });

      // 2. Reproduire le lancement d'une PWA fraîchement installée : la session
      //    vit dans les cookies et survit, le consentement vit dans localStorage
      //    et non — l'application installée a son propre bac à sable, elle n'a
      //    jamais vu la décision prise dans Safari. C'est l'état exact au
      //    lancement, obtenu sans émuler quoi que ce soit.
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();

      const constats: Constat[] = [];
      for (const ecran of ECRANS) {
        await page.setViewportSize({ width: ecran.w, height: ecran.h });
        // Laisser le layout et le ResizeObserver de la bannière se stabiliser :
        // sans cette attente on mesurerait un état intermédiaire et on
        // accuserait l'application.
        await page.waitForTimeout(250);
        const m = await mesurer(page);
        constats.push({ ecran: `${ecran.nom} (${ecran.w}×${ecran.h})`, ...m });
      }

      // Garde-fou anti-vacuité : si la bannière ne s'affiche jamais, ce test
      // ne prouve rien et doit le DIRE plutôt que passer au vert. C'est la faute
      // exacte que ce fichier existe pour ne pas reproduire.
      expect(
        constats.filter((c) => !c.banniereAffichee).map((c) => c.ecran),
        'écrans où la bannière ne s’est pas affichée — le test n’y démontre rien',
      ).toEqual([]);

      expect(
        constats
          .filter((c) => c.inatteignables.length > 0)
          .map((c) => `${c.ecran} → ${c.inatteignables.join(' | ')}`),
        'destinations présentes, visibles, dans le viewport — et recouvertes par un élément fixe',
      ).toEqual([]);

      expect(
        constats
          .filter((c) => c.destinationsAtteignables < 2)
          .map((c) => `${c.ecran} → ${c.destinationsAtteignables}`),
        'écrans où un utilisateur connecté ne peut atteindre aucune navigation utilisable',
      ).toEqual([]);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
