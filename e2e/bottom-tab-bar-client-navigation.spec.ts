import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();

/**
 * La barre d'onglets doit apparaître quand on ATTEINT `/app` PAR UN CLIC.
 *
 * ## Le trou que cette spec bouche
 *
 * `shouldMountBottomTabBar()` lit l'en-tête `x-pathname` — celui de la requête
 * du DOCUMENT — et était consommé dans `[locale]/layout.tsx`, un layout PARTAGÉ
 * que Next ne re-rend pas en navigation client. La décision restait donc figée
 * sur la valeur du premier chargement, pour toute la vie du document.
 *
 * Le manifeste porte `start_url: '/'`, une route EXCLUE. L'application installée
 * démarrait donc toujours sans barre ; le seul chemin vers le cockpit est un
 * `<Link>` ; et en `standalone`, iOS n'offre aucun geste qui charge un nouveau
 * document. **La barre ne pouvait structurellement jamais apparaître.**
 *
 * Aucune spec ne pouvait le voir : `navigation-reachable.spec.ts` fait
 * `page.goto()` avant de mesurer, et un `goto` charge un document — ce qui
 * recalcule précisément la valeur qui était en cause. Un harnais qui recharge
 * avant de regarder ne peut pas trouver un défaut de navigation client.
 *
 * ## Ce qui rend cette spec non vacuo
 *
 * Trois affirmations, dans cet ordre, et la troisième est celle qui compte :
 *
 *   1. sur `/` — route exclue — la barre est ABSENTE. Sans ce point de départ,
 *      une barre déjà montée rendrait le reste sans objet ;
 *   2. après le clic, elle est visible ET posée au bas du viewport. La
 *      GÉOMÉTRIE, pas le compte : un élément en `display:none` compte 1 ;
 *   3. **aucune navigation de document n'a eu lieu entre les deux.** Sans cette
 *      garde, une régression qui transformerait le lien en chargement complet
 *      laisserait la spec verte tout en ramenant le défaut : la barre
 *      apparaîtrait à nouveau pour la mauvaise raison.
 *
 * Le viewport est posé explicitement à 390 × 844. `chromium-desktop` fait
 * 1280 px de large — exactement la largeur à laquelle `xl:hidden` fait
 * disparaître la barre (`BottomTabBar.tsx:191`). S'en remettre au viewport du
 * projet ferait échouer cette spec sur une application saine.
 */
test.describe("barre d'onglets — atteinte de /app par navigation client", () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  // Trois chargements de document (login, /app, /) plus une navigation client.
  // Le budget par défaut suffit en build de production, pas en `next dev` où la
  // première compilation de chaque route se paie une fois.
  test.setTimeout(120_000);

  test('la barre apparaît en arrivant sur /app par clic, sans rechargement', async ({ page }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin);

    try {
      await page.setViewportSize({ width: 390, height: 844 });

      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      // Chargement de DOCUMENT sur `/`. C'est le point de départ réel de
      // l'application installée : le manifeste y envoie à chaque ouverture, et
      // `/` est une route exclue — donc la décision de montage est figée sur
      // « pas de barre » pour toute la vie de ce document.
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('bottom-tab-bar')).toHaveCount(0);

      const navigationsAvant = await page.evaluate(
        () => performance.getEntriesByType('navigation').length,
      );

      // Le seul chemin vers le cockpit depuis la vitrine : le CTA du header.
      // C'est un `<Link>`, donc une navigation CLIENT — celle que le layout
      // partagé ne re-rend pas.
      await page.getByRole('link', { name: /^mon cockpit$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      const barre = page.getByTestId('bottom-tab-bar');
      await expect(barre).toBeVisible();

      // Géométrie, pas présence : la barre doit être posée AU BAS du viewport.
      // Une barre rendue mais repoussée hors écran satisferait `toBeVisible`
      // dans certains cas et ne servirait à personne.
      const boite = await barre.boundingBox();
      expect(boite, "la barre n'a pas de boîte mesurable").not.toBeNull();
      expect(boite!.height).toBeGreaterThan(0);
      expect(boite!.y + boite!.height).toBeGreaterThan(844 - 120);

      // LA garde. Si ce nombre a bougé, un document a été chargé, et
      // l'apparition de la barre ne prouve plus rien du défaut visé.
      const navigationsApres = await page.evaluate(
        () => performance.getEntriesByType('navigation').length,
      );
      expect(
        navigationsApres,
        'un document a été chargé : la barre est apparue pour la mauvaise raison',
      ).toBe(navigationsAvant);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
