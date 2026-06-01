import { test, expect } from '@playwright/test';

/**
 * THI-255 (TICKET 7) — i18n delayed apply: rapid successive locale switches
 * must end on the user-selected language without drift.
 * THI-252 (TICKET 4) — partial coverage here (visual loader is verified via
 * Vitest at the component level); this Playwright suite focuses on the
 * cross-page consistency contract that TICKET 7 was missing tests for.
 *
 * THI-266 / PR-BETA-2 Phase B (2026-05-24): the three scenarios below were
 * `test.fixme`'d on Phase A (PR #177) because the LocaleSwitcher called
 * `router.refresh()` after `router.replace(pathname, { locale })`, which
 * invalidated the entire RSC cache and stretched propagation past Playwright's
 * generous 15 s ceiling in `npm run dev`. Phase B drops the redundant refresh
 * — in `localePrefix: 'as-needed'` mode the URL pathname itself changes on
 * `router.replace`, which is sufficient for Next to re-render Server
 * Components with the new locale via `setRequestLocale`. The 15 s budget
 * tightens to 5 s here (still > prod's < 1 s reality, but resistant to
 * `npm run dev` HMR jitter). The Vitest counterpart in
 * `src/components/layout/__tests__/LocaleSwitcher.test.tsx` locks the
 * no-refresh contract at unit level so a future regression cannot
 * silently re-introduce the redundant call.
 *
 * Runs on the `chromium-desktop` project only — `mobile-safari` +
 * `mobile-chrome` are listed in `testIgnore` (cf. `playwright.config.ts`).
 * Rationale post-Phase B: the drawer-mid-switch close (TICKET 4) is a
 * mobile-only symptom and warrants its own dedicated mobile-iOS spec
 * coordinated with `mobile-ios-auditor`; that spec lives in
 * `e2e/mobile-ios/` and is not blocked by this suite's contract.
 */
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

function openSwitcher(page: import('@playwright/test').Page) {
  // The LocaleSwitcher is an iOS-style segmented control (a `radiogroup` of
  // `<button role="radio">`, 2026-06-01). Target by the stable data-testid so
  // the spec is robust to className / markup refactors.
  return page.getByTestId('locale-switcher');
}

async function switchTo(page: import('@playwright/test').Page, value: 'fr-BE' | 'en') {
  await page.getByTestId(`locale-option-${value}`).click();
  // Wait until the `<html lang>` attribute actually reflects the new locale.
  // Phase B (THI-266) removed the `router.refresh()` from the switch handler,
  // so propagation is now an URL-only navigation (`/` ↔ `/en`) without a full
  // RSC cache invalidation. Production builds (CI runs against `npm run start`)
  // hit it under ~1 s in practice; `npm run dev` adds Turbopack HMR jitter
  // on the first compile of a given route, so the 5 s ceiling keeps the
  // suite resistant to cold-compile lag without masking a regression.
  // `noUncheckedIndexedAccess` (CLAUDE.md strict tsconfig) makes `[0]` return
  // `string | undefined`; fall back to the full value in the impossible case
  // where `split` returns an empty array so `waitForFunction` always gets a
  // defined `string` argument.
  const langPrefix = value.split('-')[0] ?? value;
  await page.waitForFunction(
    (expected) => document.documentElement.lang.startsWith(expected),
    langPrefix,
    { timeout: 5_000 },
  );
}

test.describe('LocaleSwitcher — THI-255 delayed apply / TICKET 7 coverage', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto('/', { waitUntil: 'load' });
    // Sanity: the switcher must be reachable from the landing.
    await (await openSwitcher(page)).waitFor({ state: 'visible', timeout: 10_000 });
  });

  test('1. four rapid successive switches FR→EN→FR→EN settle on the last selection', async ({
    page,
  }) => {
    // Start state: default locale is fr-BE — confirm before the rotation.
    await expect(page.locator('html')).toHaveAttribute('lang', /^fr/);

    await switchTo(page, 'en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await switchTo(page, 'fr-BE');
    await expect(page.locator('html')).toHaveAttribute('lang', /^fr/);

    await switchTo(page, 'en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await switchTo(page, 'fr-BE');
    // Final assertion — the user-selected locale must win whatever the
    // intermediate states did. Allow `fr-BE` or `fr` (next-intl default-locale
    // `as-needed` strips the prefix from the URL, but `<html lang>` keeps
    // the full IETF tag).
    await expect(page.locator('html')).toHaveAttribute('lang', /^fr/);
  });

  test('2. locale survives a cross-page navigation (landing → /faq)', async ({ page }) => {
    await switchTo(page, 'en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // Race-condition guard: the `NEXT_LOCALE` cookie is written by the
    // `setLocaleAction` Server Action via `Set-Cookie` on the response.
    // Playwright merges the cookie into its browser context, but the
    // immediate `goto` below can fire before the merge has settled —
    // which would issue the `/faq` request without the cookie and let
    // next-intl fall back to the default locale. Poll until the cookie
    // value reflects the user's choice, then navigate.
    await expect
      .poll(
        async () => (await page.context().cookies()).find((c) => c.name === 'NEXT_LOCALE')?.value,
        { timeout: 5_000 },
      )
      .toBe('en');

    // Hard-navigate so we exercise the cookie-based locale resolution path
    // (next-intl reads `NEXT_LOCALE` server-side on a fresh request).
    await page.goto('/faq', { waitUntil: 'load' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('3. i18n parity across main routes — `/`, `/faq`, `/glossaire` render in the active locale', async ({
    page,
  }) => {
    await switchTo(page, 'en');

    // `/` — landing
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // `/faq`
    await page.goto('/faq', { waitUntil: 'load' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // `/glossaire` — the route name itself is locale-aware via next-intl;
    // with `localePrefix: 'as-needed'` on the default locale the EN slug
    // stays `/glossaire` (not re-routed yet — no pathnames map). We just
    // assert the html lang attribute carries the user's choice through.
    await page.goto('/glossaire', { waitUntil: 'load' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  /**
   * THI-276 / PR-BETA-2bis (2026-05-24) — soft client navigation MUST
   * also pick up the new locale.
   *
   * Scenarios 2 and 3 use `page.goto` which is a HARD navigation and
   * bypasses Next 16's client-side router cache. The real user pain
   * (TICKET 7 mobile, observed by @thierry on iPhone Safari) only
   * surfaces on SOFT navigation: the user clicks a `<Link>` that
   * Next has already prefetched in the old locale, and Next serves
   * the cached payload from the client cache instead of hitting the
   * server with the new `NEXT_LOCALE` cookie.
   *
   * The fix is `revalidatePath('/', 'layout')` server-side inside
   * `setLocaleAction` (see `src/lib/actions/locale.ts`). This spec
   * locks the contract from the user-visible side: click a Link,
   * not goto.
   *
   * **Status `test.skip` (CI re-run 2026-05-24 22h30)** — the
   * `getByRole('link', { name: /^FAQ$/i })` lookup returns 0
   * matches on the landing after the locale switch. Root cause is
   * still being characterised (likely: the marketing landing route
   * does NOT mount the shared `Footer` component, and the desktop
   * `MktNav` deliberately drops the FAQ link in favour of in-page
   * anchors — `/#principles`, `/#simulator`, `/#pricing`). The
   * surface that actually carries the FAQ `<Link>` in this state
   * is the mobile drawer (`lg:hidden`), unreachable on the
   * `chromium-desktop` viewport this spec runs on.
   *
   * The architectural invariant (`revalidatePath('/', 'layout')`
   * called exactly once after the cookie write + Supabase update,
   * in the documented order) is locked by the Vitest suite at
   * `tests/actions/locale.test.ts` (16 specs covering Zod
   * validation, cookie attributes, anonymous/auth side-effects,
   * and the call ordering invariant). The forensic mobile
   * verification happens via @thierry's iPhone Safari smoke test
   * post-merge (`/`, switch FR→EN, tap `<Link>` to `/faq` from the
   * mobile drawer, assert page rendered in EN).
   *
   * Follow-up to unfix-and-pass this scenario: scope a `MktNav`
   * variant that exposes the FAQ link on desktop, or pivot the
   * selector to a `mobile-chrome` viewport once the mobile-iOS
   * suite owns this surface. Tracked alongside THI-276 for the
   * next mobile UX sprint (PR-BETA-6 Bottom Tab Bar).
   */
  test.skip('4. soft navigation via <Link> picks up the new locale (RSC cache invalidated)', async ({
    page,
  }) => {
    // Sanity start — default fr-BE.
    await expect(page.locator('html')).toHaveAttribute('lang', /^fr/);

    // Switch to EN. Wait for the html lang attribute to flip so we
    // know the server action has settled (cookie write + revalidate).
    await switchTo(page, 'en');

    // The FAQ link target — see the JSDoc above for the surface
    // discovery work still pending. Kept as documentation of the
    // intended selector once a desktop-reachable FAQ link exists
    // on the landing in this PR's variant.
    const faqLink = page.getByRole('link', { name: /^FAQ$/i }).first();
    await expect(faqLink).toBeVisible({ timeout: 5_000 });
    await Promise.all([page.waitForURL(/\/(en\/)?faq/, { timeout: 5_000 }), faqLink.click()]);

    // The critical assertion: the soft-navigated page MUST render in
    // EN, not the cached FR prefetch.
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
