/**
 * landing.spec.ts — Sprint Mobile Recovery PR-QA-1b
 *
 * Audits the public landing page (/) on iPhone Safari WebKit. Captures the
 * 6 visual bugs reported by @thierry on 2026-05-04 morning (horizontal
 * overflow, theme toggle full-screen, missing direct login CTA, hero
 * layout, footer accessibility) plus drawer focus trap regression.
 *
 * Tests are written to FAIL when bugs are present. Outputs feed PR-QA-1c.
 */

import { test, expect } from './fixtures/mobile-test';

test.describe('Landing — iPhone Safari WebKit (PR-QA-1b)', () => {
  test('no horizontal overflow on the entire landing page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const overflow = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
    }));

    // Allow 1px tolerance for sub-pixel rounding (Safari/WebKit reports 393.5 etc.)
    expect(
      overflow.bodyScrollWidth - overflow.clientWidth,
      `body.scrollWidth=${overflow.bodyScrollWidth}, clientWidth=${overflow.clientWidth} — horizontal overflow detected (this is the @thierry-2026-05-04 bug)`,
    ).toBeLessThanOrEqual(1);

    expect(overflow.docScrollWidth - overflow.clientWidth).toBeLessThanOrEqual(1);
  });

  test('hero section: no element overflows the viewport horizontally', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Inspect every direct descendant of <main> for horizontal overflow.
    const overflowingChildren = await page.evaluate(() => {
      const offenders: Array<{ tag: string; classes: string; right: number; clientWidth: number }> =
        [];
      const all = document.querySelectorAll('main *');
      const { clientWidth } = document.documentElement;
      for (const el of all) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.right > clientWidth + 1) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            classes: (el as HTMLElement).className?.toString?.().slice(0, 80) ?? '',
            right: Math.round(rect.right),
            clientWidth,
          });
        }
      }
      return offenders.slice(0, 5);
    });

    expect(
      overflowingChildren,
      `Found elements overflowing horizontally: ${JSON.stringify(overflowingChildren)}`,
    ).toEqual([]);
  });

  test('"Se connecter" CTA reachable in ≤ 2 taps from landing (NOT via /signup)', async ({
    page,
  }) => {
    test.fixme(
      true,
      'BUG-iOS-003: no direct "Se connecter" CTA on landing mobile (mirrors auth-flow.spec.ts assertion). Fix in PR-QA-1c-3.',
    );
    await page.goto('/');

    // Path 1: a directly visible login link (1 tap)
    const directLogin = page.getByRole('link', { name: /se connecter/i }).first();
    const directVisible = await directLogin.isVisible().catch(() => false);
    if (directVisible) {
      await directLogin.click();
      await page.waitForURL(/\/login\b/, { timeout: 10_000 });
      expect(page.url(), 'Landed somewhere other than /login').toMatch(/\/login\b/);
      return;
    }

    // Path 2: open hamburger, then tap login (2 taps)
    const hamburger = page.getByRole('button', { name: /menu|ouvrir le menu|navigation/i }).first();
    const hamburgerVisible = await hamburger.isVisible().catch(() => false);
    expect(
      hamburgerVisible,
      'No "Se connecter" link AND no hamburger — login path > 2 taps from landing (this is the @thierry-2026-05-04 bug)',
    ).toBeTruthy();
    await hamburger.click();

    const drawerLogin = page.getByRole('link', { name: /se connecter/i }).first();
    await drawerLogin.click();
    await page.waitForURL(/\/login\b/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/login\b/);
  });

  test('theme toggle: popover/menu does NOT cover more than 80% of viewport width', async ({
    page,
  }) => {
    test.fixme(
      true,
      'BUG-iOS-004: theme toggle popover takes near-full-screen on mobile ("toggle bouffe l\'écran" — @thierry 2026-05-04). Fix in PR-QA-1c-2 (compact mobile variant or max-w-[90vw]).',
    );
    await page.goto('/');

    // The theme toggle is typically a button labelled "thème", "theme",
    // or that exposes Sun/Moon icon names. We try a few common selectors.
    const themeButton = page
      .getByRole('button', { name: /thème|theme|mode sombre|mode clair|sun|moon|appearance/i })
      .first();
    const visible = await themeButton.isVisible().catch(() => false);
    if (!visible) {
      test.skip(true, 'Theme toggle not present on landing — skipping (no bug to detect).');
      return;
    }

    await themeButton.click();

    // Look for a popover / menu / dialog that just appeared.
    const popover = page
      .locator(
        '[role="menu"], [role="dialog"], [role="listbox"], [data-radix-popper-content-wrapper]',
      )
      .first();
    const popoverVisible = await popover.isVisible({ timeout: 2000 }).catch(() => false);
    if (!popoverVisible) {
      // Some toggles flip the theme directly without a popover — that's fine.
      return;
    }

    const dimensions = await popover.evaluate((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });

    const widthRatio = dimensions.width / dimensions.viewportWidth;
    const heightRatio = dimensions.height / dimensions.viewportHeight;
    expect(
      widthRatio,
      `Theme popover takes ${Math.round(widthRatio * 100)}% of viewport width (max 80% — this is the @thierry-2026-05-04 "toggle bouffe l'écran" bug)`,
    ).toBeLessThanOrEqual(0.8);
    expect(
      heightRatio,
      `Theme popover takes ${Math.round(heightRatio * 100)}% of viewport height (max 50%)`,
    ).toBeLessThanOrEqual(0.5);
  });

  test('viewport meta: declares viewport-fit=cover for safe-area support', async ({ page }) => {
    await page.goto('/');
    const viewport = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta?.getAttribute('content') ?? '';
    });
    expect(
      viewport,
      `<meta name="viewport"> content="${viewport}" missing viewport-fit=cover — safe-area-inset-* won't evaluate correctly on iPhone notch/home indicator`,
    ).toMatch(/viewport-fit\s*=\s*cover/);
  });

  test('footer: legal links are visible AND tappable (≥ 44×44 px)', async ({ page }) => {
    test.fixme(
      true,
      'BUG-iOS-005: footer legal links (CGU, Privacy, Cookies) have height < 44px on mobile (HIG violation). Fix in PR-QA-1c-5 (add py-2 or min-h-11 to anchors).',
    );
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const footer = page.getByRole('contentinfo');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeVisible();

    // CGU + Privacy links (legal anchors)
    const legal = footer.getByRole('link', { name: /CGU|conditions|confidentialité|cookies/i });
    const count = await legal.count();
    expect(count, 'Expected at least 2 legal links in footer').toBeGreaterThanOrEqual(2);

    for (let i = 0; i < count; i++) {
      const link = legal.nth(i);
      const box = await link.boundingBox();
      if (!box) continue;
      const linkText = (await link.textContent())?.trim() ?? `(link ${i})`;
      expect(
        box.height,
        `Footer link "${linkText}" has height ${box.height}px (HIG ≥ 44px)`,
      ).toBeGreaterThanOrEqual(44);
    }
  });

  test('body has overflow-x: hidden or clip (defensive against accidental wide elements)', async ({
    page,
  }) => {
    test.fixme(
      true,
      'BUG-iOS-006: body has default overflow-x: visible — no defensive clip against future accidental wide elements. Low-effort fix in PR-QA-1c-6 (add `overflow-x-clip` to body class in layout.tsx).',
    );
    await page.goto('/');
    const overflowX = await page.evaluate(() => {
      return window.getComputedStyle(document.body).overflowX;
    });
    expect(
      ['hidden', 'clip'],
      `body.overflow-x="${overflowX}" — should be "hidden" or "clip" to defend against accidental horizontal overflow`,
    ).toContain(overflowX);
  });
});
