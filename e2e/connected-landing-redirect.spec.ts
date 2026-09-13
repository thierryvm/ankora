import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();

/** Directives that let a shared cache (a CDN) store and replay a response. */
const SHARED_CACHE = /\b(public|s-maxage)\b/;

/**
 * A signed-in visitor who opens the public home page goes to the cockpit.
 *
 * Reported from a real session: ankora.be served the marketing page to someone
 * already signed in, and reaching the cockpit took one more tap on every visit.
 * The installed PWA already starts on /app (`src/app/manifest.ts`), but a
 * browser tab, a bookmark or an old home-screen shortcut still opened `/`.
 *
 * ## What makes this spec able to fail
 *
 *   1. The redirect is read WITHOUT following it (`maxRedirects: 0`). A browser
 *      that ends on /app does not prove a server redirect: Next can also send
 *      the page and redirect from the client once rendering has started, which
 *      would flash the marketing page first. Only a 307 on the document proves
 *      the page was never sent.
 *   2. That 307 must not be cacheable by a shared cache: no `public`, no
 *      `s-maxage`. A CDN holding it would send every visitor, signed in or not,
 *      to /app — and from there to /login. The header is not required to be
 *      present: without either directive Vercel does not cache the response.
 *   3. The locale survives: `/en` goes to `/en/app`, not to the French cockpit.
 *   4. The negative witness: once the cookies are gone, `/` stays on the
 *      marketing page. Without it, a redirect applied to EVERYONE would pass
 *      steps 1 to 3.
 */
test.describe('home page — a signed-in visitor goes to the cockpit', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  test('/ and /en redirect a session to the cockpit on the server; without a session / stays public', async ({
    page,
    context,
  }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      // 1 + 2. The document answer itself, redirect not followed. `page.request`
      // shares the browser context's cookies, so this is the signed-in visitor.
      const root = await page.request.get('/', { maxRedirects: 0 });
      expect(root.status(), 'expected a server redirect on the document').toBe(307);
      expect(new URL(root.headers()['location'] ?? '', 'http://origin').pathname).toBe('/app');
      expect(root.headers()['cache-control'] ?? '').not.toMatch(SHARED_CACHE);

      // What the visitor experiences: the browser ends on the cockpit.
      await page.goto('/');
      await expect(page).toHaveURL(/\/app\/?$/);

      // 3. The locale survives the redirect.
      const english = await page.request.get('/en', { maxRedirects: 0 });
      expect(english.status()).toBe(307);
      expect(new URL(english.headers()['location'] ?? '', 'http://origin').pathname).toBe(
        '/en/app',
      );

      // 4. Negative witness: no session, no redirect.
      await context.clearCookies();
      const anonymous = await page.request.get('/', { maxRedirects: 0 });
      expect(anonymous.status()).toBe(200);
      expect(anonymous.headers()['cache-control'] ?? '').not.toMatch(SHARED_CACHE);
      await page.goto('/');
      await expect.poll(() => new URL(page.url()).pathname).toBe('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
