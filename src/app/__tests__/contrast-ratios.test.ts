import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WCAG 2.1 contrast guard for the semantic status colours (ADR-035).
 *
 * Why this exists: until 2026-07-29 the four status tokens had a single value
 * shared by both themes, so each one failed AA in one of the two — `text-danger`
 * at 3.59:1 on a dark card, `text-warning` at 3.19:1 on a light one, `text-info`
 * in BOTH (4.10 / 4.23). The app claims WCAG 2.2 AA; on this point it held in
 * neither theme, across ~70 production usages.
 *
 * `globals-tokens.test.ts` pins the hex values by regex, which catches an
 * accidental deletion but says nothing about whether a *new* value is legible.
 * This test computes the real relative luminance and ratio, so a future token
 * change is judged on what it does to a reader rather than on whether someone
 * remembered to update a regex.
 *
 * Strategy mirrors `globals-tokens.test.ts`: read the CSS as text. jsdom has
 * flaky support for Tailwind v4 `@theme {}` blocks, and getComputedStyle would
 * not resolve the `[data-theme='dark']` cascade here anyway.
 */
const cssPath = resolve(__dirname, '..', 'globals.css');
const css = readFileSync(cssPath, 'utf8');

/** Extracts the body of the first block opened by `marker`, balancing braces. */
function blockAfter(marker: string): string {
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`Block not found in globals.css: ${marker}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`Unbalanced braces after ${marker}`);
}

const THEME_BLOCK = blockAfter('@theme');
const DARK_BLOCK = blockAfter("[data-theme='dark']");

function tokenIn(block: string, name: string): string {
  const m = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m?.[1]) throw new Error(`Token --${name} not found (or not a 6-digit hex)`);
  return m[1].toLowerCase();
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG 2.1 contrast ratio, always >= 1. */
function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** AA for normal-size text. */
const AA_NORMAL_TEXT = 4.5;

const STATUS_TOKENS = ['color-success', 'color-warning', 'color-danger', 'color-info'] as const;

describe('globals.css — WCAG AA contrast of semantic status colours (ADR-035)', () => {
  const lightSurface = tokenIn(THEME_BLOCK, 'color-card');
  const darkSurface = tokenIn(DARK_BLOCK, 'color-card');

  it('the two card surfaces are the ones the ratios are computed against', () => {
    expect(lightSurface).toBe('#ffffff');
    expect(darkSurface).toBe('#111a2e');
  });

  describe.each(STATUS_TOKENS)('--%s', (token) => {
    it('passes AA 4.5:1 on the light card', () => {
      const value = tokenIn(THEME_BLOCK, token);
      const ratio = contrastRatio(value, lightSurface);
      expect(
        ratio,
        `--${token} is ${value} on ${lightSurface} → ${ratio.toFixed(2)}:1, below AA ${AA_NORMAL_TEXT}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it('has a dark-mode override', () => {
      // A token with no override inherits its light value onto a navy card,
      // which is exactly how all four came to fail AA in one theme each.
      expect(
        DARK_BLOCK,
        `--${token} has no [data-theme='dark'] override; one value cannot pass AA on both surfaces`,
      ).toMatch(new RegExp(`--${token}:\\s*#[0-9a-fA-F]{6}`));
    });

    it('passes AA 4.5:1 on the dark card', () => {
      const value = tokenIn(DARK_BLOCK, token);
      const ratio = contrastRatio(value, darkSurface);
      expect(
        ratio,
        `--${token} is ${value} on ${darkSurface} → ${ratio.toFixed(2)}:1, below AA ${AA_NORMAL_TEXT}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });
  });

  describe('brand text token (the one `text-brand-*` surface used for prose)', () => {
    it('passes AA on both themes', () => {
      const light = tokenIn(THEME_BLOCK, 'color-brand-text');
      const dark = tokenIn(DARK_BLOCK, 'color-brand-text');
      expect(contrastRatio(light, lightSurface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(contrastRatio(dark, darkSurface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it('--color-brand-600 stays a distinct step of the scale, not a copy of 700', () => {
      // ADR-035 considered aligning --color-brand-600 with the AA value
      // #0f766e. That is --color-brand-700 verbatim, so it would have collapsed
      // two steps of the palette to fix a token used for focus rings and a
      // single decorative list marker. The marker moved to --color-brand-text
      // instead; the scale is left alone.
      expect(tokenIn(THEME_BLOCK, 'color-brand-600')).not.toBe(
        tokenIn(THEME_BLOCK, 'color-brand-700'),
      );
    });
  });

  /**
   * ADR-036 — warning must stay legible AND stay apart from the laiton.
   *
   * The @cowork decision of 2026-04-25 pinned `--color-warning` to amber
   * `#d97706` for one reason: an admin pigment (`--color-accent-*`, laiton
   * nautique) and a warning colour that read as the same swatch is a semantic
   * confusion. That decision had no test, so ADR-035 could reach AA with
   * `#a35a06` without noticing it had dropped the separation to 1.03 — two
   * colours of practically identical lightness.
   *
   * A second criterion therefore gets a second assertion. 1.30 is the floor:
   * `#d97706` scored 1.60 and was considered distinct, `#a35a06` scored 1.03
   * and was not, so the threshold sits between them, nearer the failing side.
   */
  describe('--color-warning vs the laiton admin pigment', () => {
    /** Below this, warning and the admin accent read as the same swatch. */
    const MIN_SEPARATION = 1.3;

    it.each([
      ['light', THEME_BLOCK, 'color-accent-600'],
      ['dark', DARK_BLOCK, 'color-accent-text'],
    ] as const)('stays separable in %s mode', (_theme, block, laitonToken) => {
      const warning = tokenIn(block, 'color-warning');
      const laiton = tokenIn(block, laitonToken);
      const separation = contrastRatio(warning, laiton);
      expect(
        separation,
        `--color-warning ${warning} vs --${laitonToken} ${laiton} → ${separation.toFixed(2)} of luminance separation, under ${MIN_SEPARATION}`,
      ).toBeGreaterThanOrEqual(MIN_SEPARATION);
    });
  });

  /**
   * Anti-regression on the exact defect ADR-035 fixes: before the change, each
   * of these four had one theme below AA. Asserting the *pair* passes stops a
   * future edit from fixing one theme by breaking the other.
   */
  it('no status token is legible in only one of the two themes', () => {
    const failures = STATUS_TOKENS.flatMap((token) => {
      const light = contrastRatio(tokenIn(THEME_BLOCK, token), lightSurface);
      const dark = contrastRatio(tokenIn(DARK_BLOCK, token), darkSurface);
      return light >= AA_NORMAL_TEXT && dark >= AA_NORMAL_TEXT
        ? []
        : [`--${token}: light ${light.toFixed(2)}:1, dark ${dark.toFixed(2)}:1`];
    });
    expect(failures, `Tokens failing AA in at least one theme:\n${failures.join('\n')}`).toEqual(
      [],
    );
  });
});
