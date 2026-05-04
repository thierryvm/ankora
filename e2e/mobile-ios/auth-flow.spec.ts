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

      const drawerLogin = page.getByRole('link', { name: /se connecter/i }).first();
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

  test('auth cookies: session cookie is httpOnly + Secure-when-HTTPS + SameSite=Lax|Strict', async ({
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
        expect(
          cookie.httpOnly,
          `Auth cookie "${cookie.name}" is NOT httpOnly — vulnerable to XSS exfiltration on iOS Safari.`,
        ).toBeTruthy();
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

      // Step 1: open user menu (most apps use a button with the user's email
      // or initials, or a "Compte" / "Profil" affordance).
      const userMenu = page
        .getByRole('button', { name: /menu|profil|compte|deconnexion|déconnexion/i })
        .first();
      const directLogout = page.getByRole('button', { name: /se déconnecter|déconnexion/i });

      const directVisible = await directLogout
        .first()
        .isVisible()
        .catch(() => false);
      if (directVisible) {
        await directLogout.first().click();
      } else {
        const menuVisible = await userMenu.isVisible().catch(() => false);
        if (!menuVisible) {
          throw new Error(
            'No visible logout button AND no user menu in /app — logout path > 2 taps.',
          );
        }
        await userMenu.click();
        const inMenuLogout = page.getByRole('button', { name: /se déconnecter|déconnexion/i });
        await inMenuLogout.first().click();
      }

      // After logout, we expect a redirect away from /app.
      await page.waitForURL(/^(?!.*\/app).*$/, { timeout: 10_000 });
      expect(page.url()).not.toMatch(/\/app\b/);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
