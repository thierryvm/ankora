import { test, expect } from '@playwright/test';

/**
 * E2E smoke for the cc-design landing assembly (PR-3c-2).
 *
 * Scope:
 * - 7 sections render on `/` (MktNav, Hero, Principles, Feature,
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

    // Principles, Feature, FAQ — distinct landmarks via id+aria-labelledby
    await expect(page.locator('section#principles')).toBeVisible();
    await expect(page.locator('section#feature')).toBeVisible();
    await expect(page.locator('section#faq')).toBeVisible();
    // Section Tarifs supprimee (PR #307). L'assertion negative garde le cas
    // dans la suite — le plancher ne bouge pas — et interdit un retour muet.
    await expect(page.locator('section#pricing')).toHaveCount(0);

    // FooterCTA + MktFooter. The regex deliberately targets h2Lead — a
    // PRESENCE probe for the section. It survived the PR L3 copy change on
    // purpose: the exact highlight wording (« déjà engagé. ») is pinned one
    // layer down by FooterCTA.test.tsx, not here. A green line here says
    // « the section renders », never « the copy is right ».
    await expect(
      page.getByRole('heading', { level: 2, name: /commence par ce qui est/i }),
    ).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
  });

  test('emits a valid FAQPage JSON-LD schema with 5 questions', async ({ page }) => {
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
    // 5 depuis PR L3 : la question sur le prix a remplace la section Tarifs
    // (2026-08-05), et l objection frontale « pourquoi une deuxieme app alors
    // que j ai celle de ma banque ? » est entree en 2e position.
    expect(parsed.mainEntity).toHaveLength(5);

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

    // body.scrollWidth, NOT documentElement.scrollWidth: issue #344 measured
    // (by falsifying the probes with a deliberately-200px-too-wide element)
    // that the documentElement probe CANNOT go red on this repo under the
    // overflow-x guard, while the body probe detects. Hardening measured
    // green on main at 375px before entering this PR (plan L3 §K.3).
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.body.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    // Allow a 1px tolerance for sub-pixel rounding (browsers report 375.5 etc.)
    expect(overflow.scrollWidth - overflow.clientWidth).toBeLessThanOrEqual(1);
  });

  test('PR-UX-1: MktNav main nav does NOT surface Sécurité / Journal (competitor benchmark)', async ({
    page,
  }) => {
    // Previously these were rendered as `aria-disabled` placeholders. PR-UX-1
    // removed them entirely after the @cowork 2026-05-18 benchmark on
    // Monarch/YNAB/Copilot — disabled items in the top nav are misleading.
    // The FSMA/legal footprint stays in the footer (`footer.security`).
    // Forces desktop viewport so the `lg:flex` main nav is part of the DOM
    // — `getByRole('navigation')` would also catch the mobile drawer otherwise.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Scope strictly to the main nav — the footer keeps `footer.security`.
    const mainNav = page.getByRole('navigation', { name: /navigation principale/i });
    await expect(mainNav.getByText('Sécurité')).toHaveCount(0);
    await expect(mainNav.getByText('Journal')).toHaveCount(0);
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

  test('exposes 3 scenario buttons with aria-pressed semantics', async ({ page, browserName }) => {
    // mobile-safari (Playwright WebKit) emulation drops the synthesised tap
    // event on small-viewport `<button>` children even after `scrollIntoViewIfNeeded`,
    // and React onClick never fires. The same interaction is covered by:
    //   - chromium-desktop (this spec)
    //   - mobile-chrome (this spec)
    //   - Vitest `<WhatIfDemoClient />` aria-pressed assertions (jsdom).
    test.skip(
      browserName === 'webkit',
      'WebKit emulation drops synthesised taps on the scenario button — covered by mobile-chrome + Vitest.',
    );

    await page.goto('/');
    const section = page.locator('section#simulator');
    await section.scrollIntoViewIfNeeded();

    const gsm = section.getByRole('button', { name: /Renégocier mon GSM/i });
    const stream = section.getByRole('button', { name: /Couper deux streamings/i });

    await expect(gsm).toHaveAttribute('aria-pressed', 'true');
    await expect(stream).toHaveAttribute('aria-pressed', 'false');

    await stream.scrollIntoViewIfNeeded();
    await stream.click();

    await expect(stream).toHaveAttribute('aria-pressed', 'true');
    await expect(gsm).toHaveAttribute('aria-pressed', 'false');
  });

  test('updates the annual KPI when the slider value changes', async ({ page, browserName }) => {
    // WebKit emulation (mobile-safari) does not fire React's synthetic
    // onChange when a controlled `<input type="range">` value is updated via
    // the native prototype setter — the valueTracker sees the new value but
    // the synthetic event is never replayed. Same coverage exists on
    // chromium-desktop + mobile-chrome here, plus Vitest unit tests.
    test.skip(
      browserName === 'webkit',
      'WebKit drops React onChange when the controlled range value is updated programmatically.',
    );

    await page.goto('/');
    const section = page.locator('section#simulator');
    await section.scrollIntoViewIfNeeded();

    const slider = section.getByRole('slider');
    await slider.scrollIntoViewIfNeeded();

    // React's controlled-input valueTracker swallows plain `el.value = X`
    // because the tracker stays in sync with the assignment. We have to go
    // through the native `HTMLInputElement.prototype` value setter so React
    // sees a "real" change, then dispatch an `input` event so the synthetic
    // onChange fires.
    await slider.evaluate((el) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(input, '20');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Le curseur porte l'ECONOMIE depuis le 22/08/2026, et l'ecran affiche le
    // prix qui en decoule. Il portait d'abord le prix : arithmetique juste,
    // geste faux — pousser vers la droite reduisait le gain et faisait
    // DESCENDRE la courbe.
    //
    // 20 EUR d'economie sur un forfait de 42 EUR : le visiteur paierait 22 EUR,
    // et gagnerait 120 EUR sur six mois. C'est la seule chose que le graphique
    // trace ; avant cette date il montait de 698 EUR dont 628 venaient d'une
    // reserve codee en dur.
    await expect(section.getByText(/Tu économises 20\s*€ par mois/)).toBeVisible();
    await expect(section.getByText(/\+120\s*€/).first()).toBeVisible();
  });

  test('trace une seule série, sans zone de seuil ni seconde courbe', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('section#simulator');
    await section.scrollIntoViewIfNeeded();

    const svg = section.locator('svg[role="img"]');
    await expect(svg).toBeVisible();

    // Une ligne, une aire. La courbe « sans changement » a disparu avec la
    // réserve fictive qu'elle traçait.
    await expect(svg.locator('path[data-testid="whatif-line"]')).toHaveCount(1);
    await expect(svg.locator('path[data-testid="whatif-area"]')).toHaveCount(1);

    // Les bandes danger/fragile/confortable qualifiaient un NIVEAU de réserve.
    // La série est désormais un ÉCART cumulé partant de zéro : elles n'ont plus
    // d'objet, elles ne sont pas seulement masquées.
    await expect(svg.locator('rect[data-threshold]')).toHaveCount(0);

    // Aucun pointillé : ni seconde série, ni grille pointillée — un pointillé
    // se lit comme un seuil ou une projection.
    await expect(svg.locator('[stroke-dasharray]')).toHaveCount(0);
  });

  test('double le graphique d une vue tableau, lisible sans souris', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('section#simulator');
    await section.scrollIntoViewIfNeeded();

    // Le survol enrichit la lecture, il ne la conditionne jamais : sans ce
    // tableau, les valeurs intermédiaires ne seraient atteignables qu'à la
    // souris. `sr-only` le masque à l'oeil sans le retirer de l'arbre
    // d'accessibilité — c'est pourquoi on l'interroge en `attached` et non en
    // `visible`.
    const table = section.locator('table');
    await expect(table).toBeAttached();
    await expect(table.locator('tbody tr')).toHaveCount(6);
  });
});
