import { test, expect } from '@playwright/test';

/**
 * E2E smoke for the cc-design landing assembly (PR-3c-2).
 *
 * Scope:
 * - 8 sections render on `/` (MktNav, Hero, Principles, Feature, Pricing,
 *   FAQ, FooterCTA, MktFooter).
 * - FAQPage JSON-LD schema is emitted, parsable, and valid against
 *   schema.org structure.
 * - Mobile viewport (375px) doesn't introduce horizontal overflow.
 *
 * a11y is already covered by `e2e/a11y/baseline.spec.ts` which scans `/`
 * with axe-core (PR #69 baseline). No duplication here.
 */

test.describe('Landing — cc-design sections smoke', () => {
  test('renders all 8 sections on /', async ({ page }) => {
    await page.goto('/');

    // MktNav (header role) — has the site logo + nav landmarks
    await expect(page.getByRole('banner')).toBeVisible();

    // Hero h1 (the only h1 on the page)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Principles, Feature, Pricing, FAQ — distinct landmarks via id+aria-labelledby
    await expect(page.locator('section#principles')).toBeVisible();
    await expect(page.locator('section#feature')).toBeVisible();
    await expect(page.locator('section#pricing')).toBeVisible();
    await expect(page.locator('section#faq')).toBeVisible();

    // FooterCTA + MktFooter
    await expect(
      page.getByRole('heading', { level: 2, name: /commence par ce qui est/i }),
    ).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
  });

  test('emits a valid FAQPage JSON-LD schema with 3 questions', async ({ page }) => {
    await page.goto('/');

    // `<script>` tags are never "visible" to Playwright's locator API on
    // mobile-safari (its visibility model is stricter than chromium's), so
    // `locator.innerHTML()` times out. `page.evaluate()` reads the DOM
    // directly without the visibility check.
    //
    // `next/script` with the default `strategy="afterInteractive"` injects
    // the <script> AFTER hydration — so we must `waitForSelector(state:
    // 'attached')` before reading, otherwise `page.evaluate` snapshots an
    // empty `textContent` (no visibility check, but no retry either).
    await page.waitForSelector('script#ld-faq', { state: 'attached' });
    const faqJsonLd = await page.evaluate(
      () => document.querySelector('script#ld-faq')?.textContent ?? '',
    );

    expect(faqJsonLd).toBeTruthy();
    const parsed = JSON.parse(faqJsonLd);

    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@type']).toBe('FAQPage');
    expect(parsed.mainEntity).toHaveLength(3);

    for (const q of parsed.mainEntity) {
      expect(q['@type']).toBe('Question');
      expect(q.name).toBeTruthy();
      expect(q.acceptedAnswer['@type']).toBe('Answer');
      expect(q.acceptedAnswer.text).toBeTruthy();
    }
  });

  test('also emits the SoftwareApplication JSON-LD (FinanceApplication)', async ({ page }) => {
    await page.goto('/');

    // Same hydration timing as #ld-faq — wait for the <script> to attach
    // before evaluating its textContent (prevents anti-flakiness).
    await page.waitForSelector('script#ld-software', { state: 'attached' });
    const softwareJsonLd = await page.evaluate(
      () => document.querySelector('script#ld-software')?.textContent ?? '',
    );

    expect(softwareJsonLd).toBeTruthy();
    const parsed = JSON.parse(softwareJsonLd);
    expect(parsed['@type']).toBe('SoftwareApplication');
    expect(parsed.applicationCategory).toBe('FinanceApplication');
    expect(parsed.offers.price).toBe('0');
    expect(parsed.offers.priceCurrency).toBe('EUR');
  });

  test('mobile viewport (375px) has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('load');

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    // Allow a 1px tolerance for sub-pixel rounding (browsers report 375.5 etc.)
    expect(overflow.scrollWidth - overflow.clientWidth).toBeLessThanOrEqual(1);
  });

  test('disabled MktNav links (Sécurité, Journal) expose aria-disabled on desktop viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const security = page.getByText('Sécurité').first();
    await expect(security).toHaveAttribute('aria-disabled', 'true');

    const journal = page.getByText('Journal').first();
    await expect(journal).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('Landing — WhatIfDemo simulator (PR-3c-3)', () => {
  test('renders the #simulator anchor — referenced by MktNav + Hero CTA', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('section#simulator');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
    await expect(section).toHaveAttribute('aria-labelledby', 'whatif-heading');
  });

  test('exposes 3 scenario buttons with aria-pressed semantics', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('section#simulator');
    await section.scrollIntoViewIfNeeded();

    const gsm = section.getByRole('button', { name: /Renégocier mon GSM/i });
    const stream = section.getByRole('button', { name: /Couper deux streamings/i });

    // gsm is the default scenario
    await expect(gsm).toHaveAttribute('aria-pressed', 'true');
    await expect(stream).toHaveAttribute('aria-pressed', 'false');

    await stream.click();

    await expect(stream).toHaveAttribute('aria-pressed', 'true');
    await expect(gsm).toHaveAttribute('aria-pressed', 'false');
  });

  test('updates the annual KPI when the slider value changes', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('section#simulator');
    await section.scrollIntoViewIfNeeded();

    const slider = section.getByRole('slider');
    await slider.evaluate((el: HTMLInputElement) => {
      // Programmatic value change + dispatch is more reliable than dragging
      // the native range thumb on Playwright's keyboard / pointer driver.
      el.value = '20';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // 20 × 12 = 240 €
    await expect(section.getByText(/\+240\s*€/)).toBeVisible();
  });

  test('renders 6 projection points + 3 threshold zones in the SVG chart', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('section#simulator');
    await section.scrollIntoViewIfNeeded();

    const svg = section.locator('svg[role="img"]');
    await expect(svg).toBeVisible();

    // 6 months × 1 point = 6 circles
    await expect(svg.locator('circle')).toHaveCount(6);

    // 3 threshold rects (danger / fragile / comfortable), all aria-hidden
    const thresholds = svg.locator('rect[data-threshold]');
    await expect(thresholds).toHaveCount(3);
  });
});
