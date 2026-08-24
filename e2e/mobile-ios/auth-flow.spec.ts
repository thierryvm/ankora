/**
 * auth-flow.spec.ts — Sprint Mobile Recovery PR-QA-1b
 *
 * THE critical spec of this PR. Documents the auth UX bug observed on
 * iPhone 14 by @thierry on 2026-05-04 (login + refresh, focus ring color,
 * input font-size triggering iOS auto-zoom, login CTA reachability from
 * the landing without going through /signup).
 *
 * Tests are written to FAIL when bugs are present — they document the
 * desired contract. Bugs found are reported in the PR-QA-1b final report
 * and become the input for PR-QA-1c (fix bugs).
 *
 * test.fixme() is acceptable for known bugs (per @cowork brief).
 */

import { test, expect } from './fixtures/mobile-test';
import { fillSignup, makeTestUser } from '../helpers/user';

test.describe('Auth flow — iPhone Safari WebKit (PR-QA-1b)', () => {
  test('signup form: every input has font-size ≥ 16px (no iOS auto-zoom)', async ({ page }) => {
    // PR-D5 (2026-05-16): BUG-iOS-001 resolved — `Input.tsx` upgraded
    // `text-sm` → `text-base` so the primitive renders at 16px in all
    // consumers (signup, login, accounts, charges, expenses, settings,
    // simulator, onboarding).
    await page.goto('/signup');

    const inputs = page.locator('input:not([type="hidden"]):not([type="checkbox"])');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const fontSize = await input.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize),
      );
      expect(
        fontSize,
        `Input ${i} (${await input.getAttribute('name')}) has font-size ${fontSize}px (must be ≥ 16 to avoid iOS Safari auto-zoom)`,
      ).toBeGreaterThanOrEqual(16);
    }
  });

  test('login form: every input has font-size ≥ 16px (no iOS auto-zoom)', async ({ page }) => {
    // PR-D5 (2026-05-16): BUG-iOS-002 resolved — see signup form fixme above.
    // Same root cause + same fix (Input.tsx text-base).
    await page.goto('/login');

    const inputs = page.locator('input:not([type="hidden"]):not([type="checkbox"])');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const fontSize = await input.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize),
      );
      expect(
        fontSize,
        `Input ${i} (${await input.getAttribute('name')}) has font-size ${fontSize}px`,
      ).toBeGreaterThanOrEqual(16);
    }
  });

  test('login email input focus: ring color uses Ankora emerald token (NOT Tailwind default blue/cyan)', async ({
    page,
  }) => {
    await page.goto('/login');
    const email = page.getByLabel('Email');
    await email.focus();

    // Read the computed ring/outline color while the input is focused.
    // Ankora emerald is the brand-* / accent-* family; Tailwind defaults are
    // blue (#3b82f6) and cyan (#06b6d4) — both are out-of-brand and the
    // observed bug on iPhone 14.
    const focusStyles = await email.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        outlineColor: style.outlineColor,
        boxShadow: style.boxShadow,
      };
    });

    // The combined "focus signal" must not contain the Tailwind blue/cyan
    // hex values. Brand tokens vary (emerald hsl(...) or oklch(...)), so we
    // assert by exclusion of known wrongs rather than match a specific value.
    const combined = `${focusStyles.outlineColor} ${focusStyles.boxShadow}`.toLowerCase();
    const tailwindBlue = ['rgb(59, 130, 246)', '#3b82f6'];
    const tailwindCyan = ['rgb(6, 182, 212)', '#06b6d4'];

    for (const wrong of [...tailwindBlue, ...tailwindCyan]) {
      expect(
        combined,
        `Focus styles contain Tailwind default "${wrong}" instead of Ankora emerald token. outline-color="${focusStyles.outlineColor}", box-shadow="${focusStyles.boxShadow}"`,
      ).not.toContain(wrong.toLowerCase());
    }
  });

  test('landing → login is reachable in ≤ 2 taps (without going through /signup)', async ({
    page,
  }) => {
    // PR-D5 (2026-05-16): BUG-iOS-003 resolved — `HeaderNav.tsx` mobile
    // drawer now exposes a direct "Se connecter" + "Créer un compte" pair
    // under the marketing variant. Tap-1 opens the hamburger, tap-2 hits
    // the login link.
    await page.goto('/');

    // Strategy:
    //   tap 1 — open the mobile menu (hamburger) OR tap a visible CTA
    //   tap 2 — tap "Se connecter"
    // Either path is acceptable. We count interactions via real navigation.
    let landedOnLogin = false;
    let tapsUsed = 0;

    // Look for a directly visible "Se connecter" link first (1-tap path)
    const directLogin = page.getByRole('link', { name: /se connecter/i });
    const directVisible = await directLogin
      .first()
      .isVisible()
      .catch(() => false);

    if (directVisible) {
      await directLogin.first().click();
      tapsUsed = 1;
    } else {
      // Try to open a hamburger / mobile menu
      const hamburger = page
        .getByRole('button', { name: /menu|ouvrir le menu|navigation/i })
        .first();
      const hasHamburger = await hamburger.isVisible().catch(() => false);
      if (!hasHamburger) {
        throw new Error(
          'No visible "Se connecter" link AND no mobile hamburger — login path > 2 taps from landing.',
        );
      }
      await hamburger.click();
      tapsUsed = 1;

      // PR-D5: target the drawer login link directly via data-testid (not
      // role/name) so we never accidentally hit the desktop header CTA
      // (which is `hidden sm:inline-flex` — found by name but not visible).
      const drawerLogin = page.getByTestId('drawer-login-link');
      await drawerLogin.click();
      tapsUsed = 2;
    }

    await page.waitForURL(/\/login\b/, { timeout: 10_000 });
    landedOnLogin = page.url().includes('/login');
    expect(landedOnLogin, `Did not land on /login after ${tapsUsed} taps`).toBeTruthy();
    expect(tapsUsed).toBeLessThanOrEqual(2);
  });

  test('signup: weak password surfaces inline error (validation works on WebKit)', async ({
    page,
  }) => {
    const user = makeTestUser();
    await fillSignup(page, { ...user, password: 'short' });
    await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();

    await expect(page.getByText(/12 caractères/i).first()).toBeVisible();
  });

  test('signup → login → refresh: session persists (LE critical bug from @thierry, 2026-05-04)', async ({
    page,
    admin,
  }) => {
    test.skip(
      !admin,
      'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).',
    );
    if (!admin) return;

    // Use the admin client to seed an already-onboarded user — much faster
    // and more reliable than going through email confirmation in CI.
    const { seedOnboardedUser, deleteSeededUser } = await import('../helpers/seed');
    const user = await seedOnboardedUser(admin, []);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      // First sanity check — we are on /app and the user landed.
      expect(page.url()).toMatch(/\/app\b/);

      // Hard reload — this is THE bug. iOS Safari ITP can purge non-httpOnly
      // localStorage / sessionStorage, but Supabase auth session must persist
      // via httpOnly cookies (server-side). After reload, we must still be
      // on /app, not redirected to /login.
      await page.reload();
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      // We MUST still be authenticated.
      expect(
        page.url(),
        'After reload, the session was lost and the user was redirected away from /app. This is the iPhone Safari auth bug.',
      ).toMatch(/\/app\b/);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('auth cookies: session cookie is Secure-when-HTTPS + SameSite=Lax|Strict', async ({
    page,
    context,
    admin,
  }) => {
    test.skip(!admin, 'Needs real Supabase.');
    if (!admin) return;

    const { seedOnboardedUser, deleteSeededUser } = await import('../helpers/seed');
    const user = await seedOnboardedUser(admin, []);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      const cookies = await context.cookies();
      const supabaseAuthCookies = cookies.filter(
        (c) => c.name.startsWith('sb-') || c.name.includes('auth-token'),
      );

      expect(
        supabaseAuthCookies.length,
        'No Supabase auth cookies found — session is not actually persisted server-side.',
      ).toBeGreaterThan(0);

      const isHttps = page.url().startsWith('https://');
      for (const cookie of supabaseAuthCookies) {
        // `httpOnly` N'EST PAS asserté ici, et l'attendu d'origine était FAUX.
        //
        // Jusqu'au 24/08/2026 cette boucle exigeait `cookie.httpOnly` et jetait
        // « vulnerable to XSS exfiltration ». À sa première exécution — elle
        // n'avait jamais tourné nulle part, cf. `scripts/lib/auth-specs.mjs` —
        // elle a échoué. Vérification faite dans la version installée plutôt que
        // de corriger l'application : `@supabase/ssr` 0.10.3 pose
        // `httpOnly: false` dans ses DEFAULT_COOKIE_OPTIONS, délibérément, et
        // `createBrowserClient` (`src/lib/supabase/client.ts`) lit la session
        // dans `document.cookie`. Un cookie `httpOnly` rendrait la session
        // illisible au client navigateur : l'assertion réclamait une propriété
        // que cette architecture ne peut pas avoir.
        //
        // L'attendu est donc retiré parce qu'il était faux, pas parce qu'il
        // gênait — et il est retiré À VOIX HAUTE : sans cette note, le prochain
        // lecteur du message d'erreur irait « corriger » une application saine,
        // et casserait l'authentification en le faisant.
        //
        // Ce qui reste asserté ci-dessous est vrai et utile : `SameSite` borne
        // l'envoi inter-sites, et `Secure` interdit le transport en clair. Si le
        // choix de Supabase doit être remis en cause un jour, cela se décide
        // dans un ADR sur la pile d'authentification, pas dans une spec e2e.
        if (isHttps) {
          expect(
            cookie.secure,
            `Auth cookie "${cookie.name}" is NOT Secure on HTTPS — Safari ITP rejects insecure auth cookies.`,
          ).toBeTruthy();
        }
        expect(
          ['Lax', 'Strict'],
          `Auth cookie "${cookie.name}" has SameSite=${cookie.sameSite}, expected Lax or Strict.`,
        ).toContain(cookie.sameSite);
      }
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('logout flow: from /app, user can log out in ≤ 2 taps and lands on / or /login', async ({
    page,
    admin,
  }) => {
    test.skip(!admin, 'Needs real Supabase.');
    if (!admin) return;

    const { seedOnboardedUser, deleteSeededUser } = await import('../helpers/seed');
    const user = await seedOnboardedUser(admin, []);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      // Le chemin RÉEL de la déconnexion sur iPhone, et pourquoi ce n'est pas
      // celui que cette spec cherchait jusqu'au 24/08/2026.
      //
      // Elle cherchait un bouton nommé « menu | profil | compte | déconnexion »
      // et jetait « logout path > 2 taps » quand elle n'en trouvait aucun. Sur
      // mobile il n'y en a effectivement aucun — par décision, pas par oubli :
      // `AccountButton` est `hidden xl:flex` (depuis le 02/08/2026, cf. sa
      // JSDoc), et la barre d'onglets du bas plus la feuille « Plus » portent la
      // navigation secondaire (THI-277).
      //
      // La sonde regardait donc une affordance de bureau sur un écran de
      // téléphone : elle rendait « la déconnexion est hors d'atteinte » alors
      // que le chemin existe et tient en deux taps. C'était un faux positif, et
      // il aurait accusé une application saine.
      //
      // Deux taps, comptés : l'onglet « Plus », puis « Se déconnecter ».
      await page.getByTestId('bottom-tab-more').click();
      await page.getByTestId('more-sheet-logout').click();

      // After logout, we expect a redirect away from /app.
      await page.waitForURL(/^(?!.*\/app).*$/, { timeout: 10_000 });
      expect(page.url()).not.toMatch(/\/app\b/);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
