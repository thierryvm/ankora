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

    // Hard-navigate to the PREFIXED path — the only thing that carries the
    // locale since 2026-07-25. `localeCookie: false` + `localeDetection: false`
    // reduced resolution to the URL prefix alone (cf. src/i18n/routing.ts), so
    // an unprefixed `/faq` now deterministically renders French. That is what
    // the app's own `<Link>`s emit once the user is in English, so this is the
    // real user path, not a workaround.
    await page.goto('/en/faq', { waitUntil: 'load' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // And the counterpart: the unprefixed URL is French for everyone.
    await page.goto('/faq', { waitUntil: 'load' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr-BE');
  });

  test('3. i18n parity across main routes — `/`, `/faq`, `/glossaire` render in the active locale', async ({
    page,
  }) => {
    await switchTo(page, 'en');

    // `/` — landing
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // `/faq` — prefixed, as the app's own `<Link>`s emit in English.
    await page.goto('/en/faq', { waitUntil: 'load' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // `/glossaire` — the slug itself is not localised (no `pathnames` map), so
    // only the prefix carries the locale.
    await page.goto('/en/glossaire', { waitUntil: 'load' });
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
   * **Un-skipped 2026-07-26.** It had been `test.skip` since 2026-05-24 with a
   * note blaming the surface: "the landing does not mount the shared Footer, and
   * MktNav drops the FAQ link in favour of in-page anchors, so no FAQ `<Link>` is
   * reachable on desktop". The first half is true; the conclusion was not. The
   * landing mounts `MktFooter` (`(public)/page.tsx:92`), which renders real
   * next-intl `<Link>`s to `/legal/cgu` and `/legal/privacy`
   * (`MktFooter.tsx:29-34`). Only the FAQ link was missing — the spec did not
   * need FAQ, it needed *any* prefetched `<Link>` leaving the landing.
   *
   * The selector now targets the href rather than the label, because the label is
   * exactly what the locale switch changes ("Conditions" → "Terms"): matching on
   * it would conflate "the link moved" with "the switch failed".
   *
   * The architectural invariant (`revalidatePath('/', 'layout')` called exactly
   * once after the cookie write + Supabase update, in the documented order) is
   * separately locked by `tests/actions/locale.test.ts` (16 specs). This one
   * locks the user-visible half: click a Link, not goto.
   */
  test('4. soft navigation via <Link> picks up the new locale (RSC cache invalidated)', async ({
    page,
  }) => {
    // Sanity start — default fr-BE.
    await expect(page.locator('html')).toHaveAttribute('lang', /^fr/);

    // Switch to EN. Wait for the html lang attribute to flip so we
    // know the server action has settled (cookie write + revalidate).
    await switchTo(page, 'en');

    // A real <Link> out of the landing, matched by destination so the assertion
    // survives the label being translated. With `localePrefix: 'as-needed'` the
    // href is `/legal/cgu` in French and `/en/legal/cgu` in English.
    const legalLink = page.locator('a[href$="/legal/cgu"]').first();
    await expect(legalLink).toBeVisible({ timeout: 5_000 });
    await Promise.all([
      page.waitForURL(/\/(en\/)?legal\/cgu/, { timeout: 10_000 }),
      legalLink.click(),
    ]);

    // The critical assertion: the soft-navigated page MUST render in
    // EN, not the cached FR prefetch.
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

/**
 * THI-XXX (2026-07-25) — the switcher must not be undone by a background prefetch.
 *
 * Root cause measured on prod: next-intl's `syncCookie` rewrites `NEXT_LOCALE`
 * on any request whose resolved locale differs from the cookie, and it cannot
 * tell a prefetch from a navigation. Right after switching back to French the
 * still-mounted English tree prefetches `/en/…?_rsc=`, and each of those reset
 * the cookie to `en` for a year. The PAGE stayed French — so an assertion on
 * `html[lang]` passes while the user is silently broken. The cookie value is
 * the only honest assertion.
 *
 * Asymmetry (also measured): FR→EN is immune, because its prefetches target
 * unprefixed URLs where the cookie already matches. Only EN→FR is corruptible,
 * which is exactly why @thierry saw it "always go back to English".
 *
 * ⚠️ Requires a PRODUCTION server: `<Link>` prefetching does not happen in
 * `npm run dev`, so this spec would be green by construction there. CI builds
 * and starts (ci.yml); locally use `E2E_PROD_SERVER=1`.
 */

/**
 * 2026-07-25 — a background prefetch must never rewrite the user's language.
 *
 * Root cause measured on prod: next-intl's `syncCookie` rewrites `NEXT_LOCALE`
 * on any request whose resolved locale differs from the cookie, and it cannot
 * tell a prefetch from a navigation. Right after switching back to French, the
 * still-mounted English tree prefetches `/en/…?_rsc=`, and each of those reset
 * the cookie to `en` for a year. The PAGE stayed French — an assertion on
 * `html[lang]` passes while the user is silently broken, which is why the
 * pre-existing skipped spec would not have caught it either. The cookie is the
 * only honest assertion.
 *
 * The prefetch is issued EXPLICITLY here rather than hoping the browser fires
 * one: the production bug is a race that reproduces roughly half the time, and
 * a test that depends on winning that race passes with OR without the fix —
 * verified 2026-07-25, which is exactly the false confidence to avoid.
 *
 * ⚠️ Needs a PRODUCTION server (`E2E_PROD_SERVER=1` locally; CI builds+starts):
 * the middleware behaviour under test is identical, but dev never prefetches.
 */
test.describe('a prefetch must not rewrite NEXT_LOCALE', () => {
  // Closed 2026-07-25 by `localeCookie: false` in `src/i18n/routing.ts`.
  // Three middleware-level fixes were built and measured first; all three are
  // structurally impossible, because Next normalises RSC requests before
  // `proxy.ts` runs (headers AND the `_rsc` query param are stripped), so the
  // middleware cannot tell a background prefetch from a real navigation. The
  // fix had to remove next-intl's write instead of trying to detect the
  // request. Verified red on the previous config, green on this one.
  // Cf. `docs/audits/2026-07-25-locale-cookie-race-diagnostic.md`.
  test('French stays French after an /en prefetch', async ({ page, baseURL }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto('/');

    // Go EN then back to FR — the real user flow, and the only way to actually
    // hold a `NEXT_LOCALE=fr-BE` cookie: a French visitor on `/` never gets one
    // written, since the resolved locale already matches and `syncCookie` only
    // writes on a mismatch.
    await switchTo(page, 'en');
    await switchTo(page, 'fr-BE');

    const localeCookie = async () =>
      (await page.context().cookies()).find((c) => c.name === 'NEXT_LOCALE')?.value;
    expect(await localeCookie(), 'precondition: the visitor chose French').toBe('fr-BE');

    // Exactly what Next emits when it prefetches an <Link href="/en/…"> that is
    // still mounted from the previous English tree. The shape below was captured
    // from a real browser prefetch on 2026-07-25 (Playwright request
    // interception): `?_rsc=<hash>` on the URL, `rsc: 1` + `next-router-prefetch: 1`
    // as headers, and NO accept header. Reproducing it faithfully matters — the
    // `_rsc` param is the only part of it that still reaches middleware, so a
    // hand-written approximation without it silently stops testing the fix.
    const status = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/en?_rsc=e2eprobe`, {
        headers: { RSC: '1', 'Next-Router-Prefetch': '1' },
        credentials: 'include',
      });
      return res.status;
    }, baseURL);
    expect(status).toBeLessThan(400);

    expect(
      await localeCookie(),
      'a prefetch of /en must NOT flip the stored language to English',
    ).toBe('fr-BE');

    // And the preference must still drive real navigation.
    await page.goto('/faq');
    expect(page.url(), 'French must not be redirected to /en').not.toMatch(/\/en(\/|$)/);
  });
});
