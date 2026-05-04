/**
 * simulator.spec.ts — Sprint Mobile Recovery PR-QA-1b
 *
 * Audits the WhatIfDemo simulator section (anchor `#simulator` on /) on
 * iPhone Safari WebKit. Captures the "scroll-to-top mal positionné" bug
 * (@thierry, 2026-05-04) and verifies tap targets respect HIG.
 *
 * Note: the slider interaction is intentionally NOT scripted on WebKit
 * (cf. e2e/landing-sections.spec.ts:160 — "WebKit drops React onChange when
 * the controlled range value is updated programmatically"). We assert the
 * slider is present + tap-target sized + initial KPI visible, the
 * value-change behavior is covered by chromium-desktop + Vitest already.
 */

import { test, expect } from './fixtures/mobile-test';

test.describe('Simulator — iPhone Safari WebKit (PR-QA-1b)', () => {
  test('section #simulator: no horizontal overflow within the section', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('section#simulator');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();

    const overflow = await section.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      offsetWidth: (el as HTMLElement).offsetWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));

    expect(
      overflow.scrollWidth - overflow.clientWidth,
      `section#simulator has internal horizontal overflow: scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`,
    ).toBeLessThanOrEqual(1);
    expect(overflow.offsetWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  });

  test('scenario buttons: each tap target is ≥ 44×44 px (Apple HIG)', async ({ page }) => {
    test.fixme(
      true,
      'BUG-iOS-009: simulator scenario buttons (Renégocier mon GSM, Couper streamings, Changer fournisseur) are 36.5px tall on iPhone (HIG ≥ 44px). Fix in PR-QA-1c-9 (add min-h-11 to ScenarioButton).',
    );
    await page.goto('/');
    const section = page.locator('section#simulator');
    await section.scrollIntoViewIfNeeded();

    const buttons = section.getByRole('button', {
      name: /Renégocier|Couper|Changer|GSM|streaming|fournisseur/i,
    });
    const count = await buttons.count();
    expect(count, 'Expected at least one scenario button in the simulator').toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const box = await btn.boundingBox();
      if (!box) continue;
      const text = (await btn.textContent())?.trim().slice(0, 40) ?? `(button ${i})`;
      expect(
        box.height,
        `Scenario button "${text}" height ${box.height}px (HIG ≥ 44px)`,
      ).toBeGreaterThanOrEqual(44);
      expect(
        box.width,
        `Scenario button "${text}" width ${box.width}px (HIG ≥ 44px)`,
      ).toBeGreaterThanOrEqual(44);
    }
  });

  test('range slider: visible and accessible by role', async ({ page }) => {
    test.fixme(
      true,
      'BUG-iOS-010: simulator <input type="range"> is exposed as role=slider but lacks explicit aria-valuemin / aria-valuemax attributes (browsers infer from min/max but assistive tech behavior varies). Fix in PR-QA-1c-10 (add aria-valuemin={0} aria-valuemax={22} on the range input).',
    );
    await page.goto('/');
    const section = page.locator('section#simulator');
    await section.scrollIntoViewIfNeeded();

    const slider = section.getByRole('slider');
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute('aria-valuemin');
    await expect(slider).toHaveAttribute('aria-valuemax');
  });

  test('SVG chart: 6 projection points + threshold zones render', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('section#simulator');
    await section.scrollIntoViewIfNeeded();

    const svg = section.locator('svg[role="img"]');
    await expect(svg).toBeVisible();
    await expect(svg.locator('circle')).toHaveCount(6);
    await expect(svg.locator('rect[data-threshold]')).toHaveCount(3);
  });

  test('scroll-to-top button: respects safe-area-inset-bottom (no overlap with home indicator)', async ({
    page,
  }) => {
    await page.goto('/');
    // Scroll to the bottom of the page to trigger any scroll-to-top affordance.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // The scroll-to-top button is typically labelled "Retour en haut" or
    // "Top" or has an arrow-up icon. Try a permissive set.
    const scrollTop = page
      .getByRole('button', { name: /retour en haut|haut de page|scroll to top|top/i })
      .first();
    const visible = await scrollTop.isVisible().catch(() => false);
    if (!visible) {
      test.skip(true, 'No scroll-to-top button on landing — skipping (no bug to detect).');
      return;
    }

    const positionInfo = await scrollTop.evaluate((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      const style = window.getComputedStyle(el);
      // bottom CSS value (might use env() — getComputedStyle resolves it)
      const bottomCss = style.bottom;
      return {
        rectBottom: Math.round(rect.bottom),
        rectTop: Math.round(rect.top),
        rectHeight: Math.round(rect.height),
        rectWidth: Math.round(rect.width),
        bottomCss,
        viewportHeight: window.innerHeight,
      };
    });

    // The button's bottom edge must be ABOVE the viewport bottom by at least
    // 16px (typical safe-area home indicator zone). If it's flush against
    // the viewport bottom, it would overlap on iPhone X+ home indicator.
    const distanceFromBottom = positionInfo.viewportHeight - positionInfo.rectBottom;
    expect(
      distanceFromBottom,
      `Scroll-to-top button is ${distanceFromBottom}px from viewport bottom — too close, will overlap iPhone home indicator (this is the @thierry-2026-05-04 bug). bottom CSS resolved to "${positionInfo.bottomCss}"`,
    ).toBeGreaterThanOrEqual(16);

    // Also verify HIG tap-target.
    expect(positionInfo.rectHeight, 'Scroll-to-top height ≥ 44 (HIG)').toBeGreaterThanOrEqual(44);
    expect(positionInfo.rectWidth, 'Scroll-to-top width ≥ 44 (HIG)').toBeGreaterThanOrEqual(44);
  });

  test('scroll-to-top: tapping it brings scrollY back to 0', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const scrollTop = page
      .getByRole('button', { name: /retour en haut|haut de page|scroll to top|top/i })
      .first();
    const visible = await scrollTop.isVisible().catch(() => false);
    if (!visible) {
      test.skip(true, 'No scroll-to-top button on landing — skipping.');
      return;
    }

    await scrollTop.click();
    // Smooth scroll on Safari can take a moment — give it 1.5s.
    await page.waitForFunction(() => window.scrollY <= 5, undefined, { timeout: 3000 });
    const finalY = await page.evaluate(() => window.scrollY);
    expect(finalY).toBeLessThanOrEqual(5);
  });
});
