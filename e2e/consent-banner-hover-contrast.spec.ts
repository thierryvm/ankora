import { test, expect, type Page } from '@playwright/test';

/**
 * The consent banner's two buttons, HOVERED, in both themes.
 *
 * Seen by @thierry on ankora.be (21 Sept. 2026), measured by the pilot: in the
 * dark theme a hovered « Refuser » painted light text on a light brand tint —
 * contrast about 1.07:1. The hover background was a fixed light tint with no
 * text colour and no dark variant.
 *
 * Imports the BASE `test` from `@playwright/test`, never the shared fixture:
 * that fixture pre-dismisses this very banner (cf. consent-first-visit.spec.ts).
 * Public spec, no account.
 */

type Rgb = [number, number, number];

/**
 * Text colour and the colour actually under it, as the page paints them. Any
 * CSS colour syntax (oklab, color-mix, color()) is resolved through a canvas,
 * and a translucent background is composited over its ancestors.
 */
async function couleursSousLeTexte(page: Page, nom: RegExp): Promise<{ fg: Rgb; bg: Rgb }> {
  const bouton = page.getByRole('button', { name: nom });
  return bouton.evaluate((el) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgba = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r!, g!, b!, a! / 255];
    };
    // Background: walk up until the stack is opaque, then composite down.
    const couches: [number, number, number, number][] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) couches.push(c);
      if (c[3] >= 1) break;
    }
    let bg: [number, number, number] = [255, 255, 255];
    for (const [r, g, b, a] of couches.reverse()) {
      bg = [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a)];
    }
    const [fr, fg, fb, fa] = rgba(getComputedStyle(el).color);
    const fg3: [number, number, number] = [
      fr * fa + bg[0] * (1 - fa),
      fg * fa + bg[1] * (1 - fa),
      fb * fa + bg[2] * (1 - fa),
    ];
    return { fg: fg3, bg };
  });
}

function contraste(a: Rgb, b: Rgb): number {
  const lum = ([r, g, b]: Rgb) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const BOUTONS = [/^Refuser$/, /^Accepter la mesure d.audience$/] as const;

for (const theme of ['dark', 'light'] as const) {
  test(`bandeau de consentement, thème ${theme === 'dark' ? 'sombre' : 'clair'} : chaque bouton survolé reste lisible (≥ 4,5:1)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto('/');
    const html = page.locator('html');
    if (theme === 'dark') await expect(html).toHaveAttribute('data-theme', 'dark');
    else await expect(html).not.toHaveAttribute('data-theme', 'dark');
    for (const nom of BOUTONS) {
      const bouton = page.getByRole('button', { name: nom });
      await expect(bouton).toBeVisible();
      await bouton.hover();
      // Read the painted colours once the hover transition has finished.
      await expect.poll(() => bouton.evaluate((el) => el.getAnimations().length)).toBe(0);
      const { fg, bg } = await couleursSousLeTexte(page, nom);
      const ratio = contraste(fg, bg);
      expect(ratio, `${nom} survolé : texte rgb(${fg}) sur rgb(${bg})`).toBeGreaterThanOrEqual(4.5);
    }
  });
}
