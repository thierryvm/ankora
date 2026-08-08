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

/**
 * Every lookup below runs on the COMMENT-STRIPPED source, never the raw file.
 *
 * This is not tidiness, it is the fix for a live defect. `globals.css` documents
 * each token next to its value, comments included — and one of those comments,
 * inside `@theme`, reads "Dark overrides live in [data-theme='dark']" with the
 * same single quotes as the real selector. It is therefore the FIRST occurrence
 * of that marker in the file, and the old `indexOf` landed on it. The test only
 * ever passed because no `{` happened to sit between that sentence and the real
 * block, so the brace scan fell through onto the right one by accident. Insert
 * one rule in between and `DARK_BLOCK` silently becomes another block — green
 * test, wrong subject.
 *
 * Comments are replaced by a SPACE, not by nothing, so stripping can never weld
 * two adjacent tokens into one.
 */
const css = readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * Body of the first block whose selector STARTS a rule with `marker`.
 *
 * Two hardenings, and the order between them is load-bearing: strip first, then
 * anchor. Anchoring on the raw text would fail, because in the raw file the
 * `[data-theme='dark']` marker is preceded by "live in " — it only becomes
 * `}`-preceded once the comment carrying it is gone.
 *
 * The anchor is a SEARCH, not a validation: occurrences are walked until one
 * starts a rule. Rejecting the first occurrence outright would throw the day
 * someone reorders the file — turning a silent false positive into a broken
 * test, which is not an improvement. It also skips substring hits inside a
 * larger selector: `[data-theme='dark']` appears mid-selector in the paper
 * scopes below, preceded by `(`, and must not be mistaken for the dark block.
 */
function blockAfter(marker: string): string {
  for (let from = 0; from < css.length; ) {
    const start = css.indexOf(marker, from);
    if (start === -1) break;
    const before = css.slice(0, start).trimEnd();
    const prev = before[before.length - 1];
    if (prev === undefined || prev === '}' || prev === ';') {
      const open = css.indexOf('{', start);
      if (open === -1) break;
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
    from = start + 1;
  }
  throw new Error(`No rule starts with this marker in globals.css: ${marker}`);
}

const THEME_BLOCK = blockAfter('@theme');
const DARK_BLOCK = blockAfter("[data-theme='dark']");

/** ADR-039 — the marketing paper scope and its `body`-level companion. */
const PAPER_SCOPE_MARKER = "html:not([data-theme='dark']) .mkt-paper";
const PAPER_BODY_MARKER = "html:not([data-theme='dark']) body:has(.mkt-paper)";
const PAPER_SCOPE_BLOCK = blockAfter(PAPER_SCOPE_MARKER);
const PAPER_BODY_BLOCK = blockAfter(PAPER_BODY_MARKER);

/**
 * Custom-property names declared in a block, in source order.
 *
 * Matches the name itself with a lookahead rather than capturing it, so the
 * result is `m[0]` — the only index TypeScript knows is always present on a
 * successful match. No cast needed, and none wanted: a cast here would hide the
 * one thing worth knowing, namely whether the pattern still matches anything.
 */
function declaredProps(block: string): string[] {
  return [...block.matchAll(/--[\w-]+(?=\s*:)/g)].map((m) => m[0]);
}

/** `--a: var(--b)` pairs — what a remap block actually points at. */
function remapPairs(block: string): Array<[string, string]> {
  return [...block.matchAll(/(--[\w-]+)\s*:\s*var\((--[\w-]+)\)/g)].map((m) => {
    const [, prop, target] = m;
    if (prop === undefined || target === undefined) {
      // Unreachable while the pattern keeps both groups. Throwing rather than
      // filtering, because a silently shorter list would weaken every assertion
      // built on it without failing anything.
      throw new Error(`remapPairs: capture group missing in "${m[0]}"`);
    }
    return [prop, target];
  });
}

/** How many times `--<name>` is DECLARED (not referenced) in the whole file. */
function declarationCount(name: string): number {
  return [...css.matchAll(new RegExp(`--${name}\\s*:`, 'g'))].length;
}

function tokenIn(block: string, name: string): string {
  const m = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m?.[1]) throw new Error(`Token --${name} not found (or not a 6-digit hex)`);
  return m[1].toLowerCase();
}

/**
 * Reads a token declared file-wide rather than inside a named block.
 *
 * The six paper pigments (ADR-039) live in a bare `:root`, and `globals.css`
 * already has a second `:root` (`color-scheme`), so a block marker would be
 * ambiguous. Reading file-wide is also a STRONGER guarantee once paired with
 * the "declared exactly once" assertion below: it pins the token's uniqueness,
 * not merely its address.
 */
function fileToken(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m?.[1]) throw new Error(`Token --${name} not found in globals.css (or not a 6-digit hex)`);
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

/**
 * Guards that `blockAfter` still points where it used to.
 *
 * The hardening above (strip comments, then anchor on a rule start) shifts every
 * offset in the file. A helper that silently changed target would keep the whole
 * suite green while asserting things about the wrong block — the exact failure
 * mode the hardening exists to prevent, reintroduced by the fix. One witness
 * value per historical block is enough: both are pinned elsewhere by
 * `globals-tokens.test.ts`, so a real edit is caught there, and a wrong-block
 * read is caught here.
 */
describe('blockAfter() — the hardened helper still resolves the historical blocks', () => {
  it('@theme is the light set', () => {
    expect(tokenIn(THEME_BLOCK, 'color-card')).toBe('#ffffff');
    expect(tokenIn(THEME_BLOCK, 'color-accent-600')).toBe('#8b6914');
  });

  it("[data-theme='dark'] is the dark set, not the sentence naming it inside @theme", () => {
    expect(tokenIn(DARK_BLOCK, 'color-card')).toBe('#111a2e');
    expect(tokenIn(DARK_BLOCK, 'color-accent-text')).toBe('#d4a017');
  });

  it('an unanchored marker is refused rather than matched mid-selector', () => {
    // `.mkt-paper` occurs only inside larger selectors, never starting a rule.
    expect(() => blockAfter('.mkt-paper')).toThrow(/No rule starts with this marker/);
  });
});

/**
 * ADR-039 — the marketing paper scope.
 *
 * The landing remaps six semantic variables to a paper/ink palette, in light
 * theme only, so components keep one vocabulary on both surfaces. This block
 * proves three separate things: the raw pigments are single-sourced, the scope
 * and its `body`-level companion cannot drift apart, and every pair the remap
 * creates is legible.
 */
describe('globals.css — WCAG AA contrast of the paper scope (ADR-039)', () => {
  const PAPER_TOKENS = [
    'color-paper',
    'color-paper-line',
    'color-paper-soft',
    'color-paper-muted',
    'color-ink',
    'color-ink-soft',
  ] as const;

  describe('the six raw pigments are single-sourced and light-only', () => {
    it.each(PAPER_TOKENS)('--%s is declared exactly once in the whole file', (token) => {
      const count = declarationCount(token);
      expect(
        count,
        `--${token} is declared ${count} time(s); raw pigments have exactly one source of truth`,
      ).toBe(1);
    });

    it.each(PAPER_TOKENS)("--%s is absent from the [data-theme='dark'] block", (token) => {
      // These two assertions INTERLOCK — neither may be deleted alone.
      // "Exactly once" alone would stay green if someone MOVED a declaration
      // into the dark block: still one declaration, but the token would become
      // dark-only and undefined in light, which is backwards. This one closes
      // that. Conversely this one alone would tolerate a duplicate in a third
      // place.
      expect(DARK_BLOCK).not.toMatch(new RegExp(`--${token}\\s*:`));
    });
  });

  describe('the scope and its body companion are one mechanism, written twice', () => {
    it('declares the same properties in both blocks', () => {
      // The duplication is deliberate: the companion is what makes
      // `body { background }` and the five `fixed` slots follow the remap, and
      // it also has to survive on its own where `:has()` is unsupported. What
      // must never happen is one being edited without the other.
      const scope = declaredProps(PAPER_SCOPE_BLOCK).sort();
      const companion = declaredProps(PAPER_BODY_BLOCK).sort();
      expect(companion, `${PAPER_SCOPE_MARKER} and ${PAPER_BODY_MARKER} drifted apart`).toEqual(
        scope,
      );
    });

    it('points both blocks at the same targets', () => {
      expect(remapPairs(PAPER_BODY_BLOCK)).toEqual(remapPairs(PAPER_SCOPE_BLOCK));
    });

    it('remaps only variables that are actually declared', () => {
      // Bounded to these two blocks ON PURPOSE. Widen it to the file and it goes
      // red on a correct mechanism: `body` reads `var(--consent-height, 0px)`,
      // which is declared nowhere in CSS — the consent banner publishes it at
      // runtime. Do not "improve" this into a file-wide check.
      const targets = [...remapPairs(PAPER_SCOPE_BLOCK), ...remapPairs(PAPER_BODY_BLOCK)].map(
        ([, to]) => to,
      );
      expect(targets.length).toBeGreaterThan(0);
      const missing = [...new Set(targets)].filter((v) => declarationCount(v.slice(2)) === 0);
      expect(missing, `remap targets with no declaration: ${missing.join(', ')}`).toEqual([]);
    });

    it('never applies the remap without the light-theme guard', () => {
      // A bare `.mkt-paper { … }` rule would repaint the dark theme too, which
      // ADR-039 explicitly refuses ("no paper by night").
      expect(css).not.toMatch(/(^|[};])\s*\.mkt-paper\s*\{/);
    });
  });

  describe('the pairs the remap creates', () => {
    const ink = () => fileToken('color-ink');
    const inkSoft = () => fileToken('color-ink-soft');
    const paper = () => fileToken('color-paper');

    it.each([
      ['ink on paper', ink, paper],
      ['ink-soft on paper', inkSoft, paper],
      ['brand-text-strong on paper', () => tokenIn(THEME_BLOCK, 'color-brand-text-strong'), paper],
      ['accent-text on paper', () => tokenIn(THEME_BLOCK, 'color-accent-text'), paper],
      [
        'card white on brand-700 (the CTA)',
        () => tokenIn(THEME_BLOCK, 'color-card'),
        () => tokenIn(THEME_BLOCK, 'color-brand-700'),
      ],
      ['ink on paper-soft', ink, () => fileToken('color-paper-soft')],
      ['ink on paper-muted', ink, () => fileToken('color-paper-muted')],
      ['ink-soft on paper-muted', inkSoft, () => fileToken('color-paper-muted')],
    ] as const)('%s passes AA 4.5:1', (_label, fg, bg) => {
      const [f, b] = [fg(), bg()];
      const ratio = contrastRatio(f, b);
      expect(
        ratio,
        `${f} on ${b} → ${ratio.toFixed(2)}:1, below AA ${AA_NORMAL_TEXT}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });
  });

  /**
   * ADR-039 keeps the four status tokens unchanged — but the remap moves the
   * PAGE background under them, and status text is not always inside a card.
   * The existing suite only ever checked them against `--color-card`, so no
   * page-background pair was covered on either surface.
   *
   * Both backgrounds are asserted together rather than paper alone: measured,
   * the two sit within 0.03 of each other (danger 4.62 slate / 4.59 paper), so
   * singling paper out would document an asymmetry that does not exist.
   *
   * `--color-danger` is the one to watch: 4.59 on paper is 0.09 above the bar.
   * Any future darkening of `--color-paper` drops it below.
   */
  describe.each([
    ['slate (default surfaces)', () => tokenIn(THEME_BLOCK, 'color-background')],
    ['paper (landing)', () => fileToken('color-paper')],
  ])('status tokens on the %s page background', (_label, background) => {
    it.each(STATUS_TOKENS)('--%s passes AA 4.5:1', (token) => {
      const value = tokenIn(THEME_BLOCK, token);
      const bg = background();
      const ratio = contrastRatio(value, bg);
      expect(
        ratio,
        `--${token} is ${value} on ${bg} → ${ratio.toFixed(2)}:1, below AA ${AA_NORMAL_TEXT}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });
  });
});
