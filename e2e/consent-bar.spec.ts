/**
 * The thin consent bar, measured the way a first-time visitor meets it.
 *
 * ⚠️ Imports the BASE `test` from `@playwright/test`, never `./helpers/test`:
 * the shared fixture pre-seeds a consent decision, so a spec built on it can
 * never see the bar (CLAUDE.md, « Un harnais ment aussi par l'état qu'il
 * installe »). Same rule as `consent-first-visit.spec.ts`.
 *
 * Since 19 September 2026 the bar is THIN and FIXED at the bottom (ADR-044).
 * Fixed is what guarantees it never pushes the page around; the bottom
 * padding it reserves on `body` is what keeps it from covering the end of the
 * page. Both halves are measured here: nothing jumping, nothing covered.
 */
import { test, expect, type Page } from '@playwright/test';

const STORAGE_KEY = 'ankora.consent.v1';
const REOPEN_KEY = 'ankora.consent.reopen';
const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1440, height: 900 };
const BAR = '[data-testid="consent-banner"]';

/**
 * Every request the two Vercel trackers can make: the production script paths
 * (`/_vercel/insights`, `/_vercel/speed-insights`) and the debug scripts the
 * packages load under `next dev` (`va.vercel-scripts.com`). Watching only one
 * family would make the "nothing loaded" assertion pass on the other server
 * mode for the wrong reason.
 */
const TRACKER = /\/_vercel\/(insights|speed-insights)\b|va\.vercel-scripts\.com/;

/** Collect tracker requests from the very first byte of the document. */
function watchTrackers(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (req) => {
    if (TRACKER.test(req.url())) seen.push(req.url());
  });
  return seen;
}

/**
 * Accumulates Cumulative Layout Shift from navigation start. `buffered: true`
 * replays the shifts that happened before the observer was attached, and
 * shifts caused by a recent input are excluded — exactly what CLS counts.
 * The Layout Instability API is Chromium-only.
 */
async function installClsProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[]) {
          if (!e.hadRecentInput) w.__cls += e.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      w.__cls = -1;
    }
  });
}

/**
 * Hydration is over when React has attached its fiber to a node. Any
 * assertion about "what the client decided" taken before this point would
 * read the server's HTML and pass for the wrong reason.
 */
async function waitForHydration(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const el = document.querySelector('main') ?? document.body;
          return Object.keys(el).some((k) => k.startsWith('__react'));
        }),
      { message: 'React never hydrated the page', timeout: 15_000 },
    )
    .toBe(true);
}

async function freshVisit(page: Page, path = '/'): Promise<void> {
  await page.context().clearCookies();
  // ONE-SHOT: an init script replays on every navigation, reloads included.
  // Clearing on each load would erase the decision a test just made and
  // bring the bar back after `reload()` — the instrument, not the app.
  await page.addInitScript(
    (keys: string[]) => {
      if (window.sessionStorage.getItem('__consent_cleared')) return;
      window.sessionStorage.setItem('__consent_cleared', '1');
      for (const k of keys) window.localStorage.removeItem(k);
    },
    [STORAGE_KEY, REOPEN_KEY],
  );
  await page.goto(path);
}

/**
 * The hero's primary call to action (the `/signup` link of the hero section),
 * brought to the centre of the screen the way a thumb would bring it, then
 * hit-tested at its centre.
 */
async function heroCta(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector('[data-testid="hero-releve-card"]');
    const section = card?.closest('section');
    const link = section?.querySelector<HTMLAnchorElement>('a[href$="/signup"]');
    if (!link) return null;
    link.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = link.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      text: (link.textContent ?? '').trim(),
      top: r.top,
      bottom: r.bottom,
      reached: Boolean(hit && (hit === link || link.contains(hit))),
      hit: hit
        ? `${hit.tagName.toLowerCase()}:${(hit.textContent ?? '').trim().slice(0, 30)}`
        : null,
      viewport: window.innerHeight,
    };
  });
}

test.describe('Consent bar — first visit, no pre-seeded state', () => {
  test('375×812: thin, two equal buttons ≥ 44 px, never covers the hero CTA or the footer', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await freshVisit(page);
    await waitForHydration(page);

    const bar = page.locator(BAR);
    await expect(bar).toBeVisible();

    const refuse = bar.getByRole('button', { name: /^refuser$/i });
    const accept = bar.getByRole('button', { name: /^accepter la mesure d.audience$/i });
    const r = await refuse.boundingBox();
    const a = await accept.boundingBox();
    expect(r, 'Refuser has no box').not.toBeNull();
    expect(a, 'Accepter has no box').not.toBeNull();
    // Refusing costs what accepting costs: same size to the pixel.
    expect(Math.abs(r!.width - a!.width), `widths ${r!.width} vs ${a!.width}`).toBeLessThanOrEqual(
      1,
    );
    expect(
      Math.abs(r!.height - a!.height),
      `heights ${r!.height} vs ${a!.height}`,
    ).toBeLessThanOrEqual(1);
    expect(r!.height, 'Refuser height').toBeGreaterThanOrEqual(44);
    expect(a!.height, 'Accepter height').toBeGreaterThanOrEqual(44);

    const barBox = await bar.boundingBox();
    // A bar, not a card: the former card was 294 px tall at this width.
    expect(barBox!.height, `bar height at 375: ${barBox!.height}`).toBeLessThanOrEqual(128);

    // Where the hero CTA sits WITHOUT any bar is not this spec's business: at
    // 375×812 it was measured at y=824..872 on 19 September 2026, below the
    // fold before any bar — that criterion belongs to the landing's hero.
    // What the bar owes is to never sit on the CTA once the visitor is there.
    const cta = await heroCta(page);
    expect(cta, 'hero /signup CTA not found').not.toBeNull();
    expect(cta!.reached, `centre of the CTA hits « ${cta!.hit} »`).toBe(true);

    // The reserve: `body` pads its bottom by the bar's height while it is
    // open, so the last link of the footer can be scrolled clear of it.
    const end = await page.evaluate(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      const barEl = document.querySelector('[data-testid="consent-banner"]')!;
      const links = [...document.querySelectorAll('footer a, footer button')];
      const last = links[links.length - 1];
      const lr = last?.getBoundingClientRect();
      const hit = lr
        ? document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2)
        : null;
      return {
        padding: parseFloat(getComputedStyle(document.body).paddingBottom),
        barTop: barEl.getBoundingClientRect().top,
        barHeight: barEl.getBoundingClientRect().height,
        lastBottom: lr?.bottom ?? null,
        lastText: (last?.textContent ?? '').trim().slice(0, 40),
        reached: Boolean(last && hit && (hit === last || last.contains(hit))),
      };
    });
    expect(end.lastBottom, 'no link in the footer').not.toBeNull();
    expect(
      Math.abs(end.padding - end.barHeight),
      `reserve ${end.padding} vs bar ${end.barHeight}`,
    ).toBeLessThanOrEqual(1);
    expect(
      end.lastBottom!,
      `last footer link « ${end.lastText} » ends at ${end.lastBottom}, bar starts at ${end.barTop}`,
    ).toBeLessThanOrEqual(end.barTop);
    expect(end.reached, `last footer link « ${end.lastText} » is covered`).toBe(true);

    test.info().annotations.push({
      type: 'measure',
      description: `375: bar h=${barBox!.height} · buttons ${r!.width}×${r!.height} / ${a!.width}×${a!.height} · CTA centred y=${Math.round(cta!.top)}..${Math.round(cta!.bottom)} · reserve ${end.padding}px`,
    });
  });

  test('1440×900: the bar stays thin and the buttons stay equal', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await freshVisit(page);
    await waitForHydration(page);
    const bar = page.locator(BAR);
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    const r = await bar.getByRole('button', { name: /^refuser$/i }).boundingBox();
    const a = await bar
      .getByRole('button', { name: /^accepter la mesure d.audience$/i })
      .boundingBox();
    expect(Math.abs(r!.height - a!.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(r!.width - a!.width), `widths ${r!.width} vs ${a!.width}`).toBeLessThanOrEqual(
      1,
    );
    // One line of text plus the buttons: a bar, not a card.
    expect(box!.height, `bar height at 1440: ${box!.height}`).toBeLessThanOrEqual(72);
    test.info().annotations.push({
      type: 'measure',
      description: `1440: bar h=${box!.height} · buttons ${r!.width}×${r!.height} / ${a!.width}×${a!.height}`,
    });
  });

  test('refusing removes the bar and loads no tracker', async ({ page }) => {
    const trackers = watchTrackers(page);
    await page.setViewportSize(MOBILE);
    await freshVisit(page);
    await waitForHydration(page);

    await page
      .locator(BAR)
      .getByRole('button', { name: /^refuser$/i })
      .click();
    await expect(page.locator(BAR)).toHaveCount(0);
    await expect
      .poll(() =>
        page
          .evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY)
          .then((v) => {
            const p = v ? (JSON.parse(v) as { analytics: boolean; marketing: boolean }) : null;
            return p && { analytics: p.analytics, marketing: p.marketing };
          }),
      )
      .toEqual({ analytics: false, marketing: false });

    // Give a tracker every chance to fire, then prove none did — the same
    // page, then a reload (the decision must survive the document).
    await page.waitForLoadState('networkidle');
    await page.reload();
    await waitForHydration(page);
    await page.waitForLoadState('networkidle');
    await expect(page.locator(BAR)).toHaveCount(0);
    expect(trackers, 'tracker requests after « Refuser »').toEqual([]);
  });

  test('accepting removes the bar and loads the audience measurement', async ({ page }) => {
    const trackers = watchTrackers(page);
    await page.setViewportSize(MOBILE);
    await freshVisit(page);
    await waitForHydration(page);
    expect(trackers, 'a tracker fired before any decision').toEqual([]);

    const firstTracker = page.waitForRequest(TRACKER, { timeout: 15_000 });
    await page
      .locator(BAR)
      .getByRole('button', { name: /^accepter la mesure d.audience$/i })
      .click();
    await expect(page.locator(BAR)).toHaveCount(0);
    await firstTracker;
    const stored = await page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY);
    const parsed = JSON.parse(stored as string) as { analytics: boolean; marketing: boolean };
    // Accepting grants audience measurement only: no marketing tracker exists.
    expect({ analytics: parsed.analytics, marketing: parsed.marketing }).toEqual({
      analytics: true,
      marketing: false,
    });
  });

  test('a stored decision that still carries a « marketing » key reads without error', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const trackers = watchTrackers(page);
    await page.setViewportSize(MOBILE);
    // The shape written by the former « Tout accepter »: marketing: true.
    await page.addInitScript((k) => {
      window.localStorage.setItem(
        k,
        JSON.stringify({
          version: '1.0.0',
          analytics: true,
          marketing: true,
          decidedAt: '2026-08-01T10:00:00.000Z',
        }),
      );
    }, STORAGE_KEY);
    await page.goto('/');
    await waitForHydration(page);
    await expect(page.locator(BAR)).toHaveCount(0);
    await expect.poll(() => trackers.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(errors, 'page errors').toEqual([]);
  });
});

test.describe('Consent bar — it never makes the page jump', () => {
  // Measured on the PHONE Chromium profile only, for two measured reasons.
  // WebKit has no Layout Instability API: a measure there reads 0 and passes
  // for the wrong reason. And desktop Chrome squeezed to 375 px is dominated
  // by the landing hero's own shift when the web font swaps in — 0.0657 then
  // 0.0779 on two identical loads on 19 September 2026, with or without the
  // bar — noise ten times larger than the threshold below. On the phone
  // profile both runs read 0.0000, and the in-flow bar this replaced failed
  // here (0.2155 for a returning visitor).
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || !isMobile,
    'layout-shift measured on the phone Chromium profile',
  );

  const returningDecision = JSON.stringify({
    version: '1.0.0',
    analytics: false,
    marketing: false,
    decidedAt: '2026-09-01T10:00:00.000Z',
  });

  async function measureCls(page: Page, decided: boolean) {
    await installClsProbe(page);
    if (decided) {
      await page.addInitScript(
        ([k, v]: string[]) => window.localStorage.setItem(k!, v!),
        [STORAGE_KEY, returningDecision],
      );
    }
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    await waitForHydration(page);
    await expect(page.locator(BAR)).toHaveCount(decided ? 0 : 1);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1_000);
    return page.evaluate(() => {
      return { cls: (window as unknown as { __cls: number }).__cls };
    });
  }

  /**
   * The bar's own contribution, isolated: the same page, same profile, with
   * the bar (first visit) and without it (returning visitor). Whatever the
   * rest of the page shifts is in both figures and cancels out.
   *
   * Attributing shift entries to the bar by their `sources` was tried and
   * dropped: an entry lists up to five sources and carries ONE value, so a
   * 1 px text reflow inside the bar during the font swap charged the whole
   * hero shift to it. The difference between the two runs has no such bias.
   */
  test('the bar adds no layout shift at 375×812 (first visit vs returning visitor)', async ({
    page,
    browser,
  }, testInfo) => {
    const first = await measureCls(page, false);
    const use = testInfo.project.use;
    const ctx = await browser.newContext({
      baseURL: use.baseURL,
      userAgent: use.userAgent,
      deviceScaleFactor: use.deviceScaleFactor,
      isMobile: use.isMobile,
      hasTouch: use.hasTouch,
      locale: use.locale,
    });
    try {
      const back = await measureCls(await ctx.newPage(), true);
      testInfo.annotations.push({
        type: 'measure',
        description: `CLS first visit=${first.cls.toFixed(4)} · returning=${back.cls.toFixed(4)}`,
      });
      expect(first.cls, 'layout-shift observer unavailable').toBeGreaterThanOrEqual(0);
      expect(
        Math.abs(first.cls - back.cls),
        `CLS with the bar ${first.cls} vs without ${back.cls}`,
      ).toBeLessThanOrEqual(0.005);
    } finally {
      await ctx.close();
    }
  });

  /**
   * The absolute threshold at 375×812 on a phone: the first visit, bar open.
   */
  test('first visit on a phone at 375×812: CLS ≤ 0.05', async ({ page }, testInfo) => {
    const first = await measureCls(page, false);
    testInfo.annotations.push({
      type: 'measure',
      description: `phone first-visit CLS=${first.cls}`,
    });
    expect(first.cls, 'first-visit CLS at 375×812 on a phone').toBeLessThanOrEqual(0.05);
  });
});
