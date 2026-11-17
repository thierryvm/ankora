import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source guards for the class families the lot B removed (15 November 2026).
 *
 * `contrast-ratios.test.ts` proves that a TOKEN pair is legible. It cannot see
 * a component that paints the wrong token, or a class that names no token at
 * all. Each family below was found rendering under WCAG AA on ankora.be:
 *
 * - `text-brand-700`: #0f766e is not redeclared in the dark theme, 2.63:1 on
 *   the dark card. Text uses `text-brand-text`, which follows the theme.
 * - Phantom tokens (`text-primary-foreground`, `bg-secondary`, …): no
 *   `--color-*` behind them, so Tailwind generates nothing and the text keeps
 *   the ink colour, about 3:1 on the teal fill. Fills write `text-on-accent`.
 * - `hover:bg-brand-600`: white on #0d9488 is 3.75:1. Hover is `brand-800`.
 * - `accent-brand-400`: 1.65:1 on the paper for a slider (1.4.11 wants 3:1).
 *
 * Comments may name these classes (they explain why they are gone), so they
 * are stripped first — by a scanner that knows strings, because a `//` inside
 * a string (`'https://…'`) is not a comment and must not hide the rest of the
 * line.
 */

const RACINE = join(process.cwd(), 'src');

function fichiers(dossier: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      if (nom !== '__tests__') fichiers(chemin, acc);
    } else if (/\.tsx?$/.test(nom) && !/\.test\.tsx?$/.test(nom)) {
      acc.push(chemin);
    }
  }
  return acc;
}

/**
 * Removes `//` and block comments (JSX `{/* … *\/}` included), keeping string
 * and template literals intact. Line breaks are preserved so positions stay
 * meaningful.
 */
function sansCommentaires(source: string): string {
  // Kept text is copied in slices, not character by character: this scanner
  // walks every source file of the app, and per-character concatenation made
  // the guard overrun the default timeout when the whole suite runs in
  // parallel.
  const parts: string[] = [];
  let kept = 0;
  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const c = source[i]!;
    const next = source[i + 1];
    if (quote) {
      if (c === '\\') i += 2;
      else {
        if (c === quote) quote = null;
        i++;
      }
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      i++;
      continue;
    }
    if (c === '/' && (next === '/' || next === '*')) {
      parts.push(source.slice(kept, i));
      let stop: number;
      if (next === '/') {
        const eol = source.indexOf('\n', i);
        stop = eol === -1 ? source.length : eol;
      } else {
        const end = source.indexOf('*/', i + 2);
        stop = end === -1 ? source.length : end + 2;
      }
      parts.push(source.slice(i, stop).replace(/[^\n]/g, ' '));
      i = kept = stop;
      continue;
    }
    i++;
  }
  parts.push(source.slice(kept));
  return parts.join('');
}

/** A class token, not a substring of a longer one (`decoration-brand-700`). */
const borne = (motif: string): RegExp => new RegExp(`(?<![\\w-])${motif}(?![\\w-])`);

/**
 * Each family: its name, a cheap substring that must be present for the
 * family to be possible at all, and the exact token pattern. The substring
 * pre-check skips the regex on the vast majority of files.
 */
const FAMILLES: ReadonlyArray<readonly [string, string, RegExp]> = [
  [
    'text-brand-700 (2.63:1 on the dark card)',
    'text-brand-700',
    borne('(?:[\\w-]+:)*text-brand-700'),
  ],
  [
    'phantom primary-foreground',
    '-primary',
    borne('(?:[\\w-]+:)*(?:text|bg|border)-primary(?:-foreground)?'),
  ],
  [
    'phantom secondary token',
    '-secondary',
    borne('(?:[\\w-]+:)*(?:text|bg|border)-secondary(?:-foreground)?'),
  ],
  ['phantom border-input', 'border-input', borne('(?:[\\w-]+:)*border-input')],
  ['hover:bg-brand-600 under white (3.75:1)', 'hover:bg-brand-600', borne('hover:bg-brand-600')],
  [
    'accent-brand-400 (1.65:1 on paper)',
    'accent-brand-400',
    borne('(?:[\\w-]+:)*accent-brand-400'),
  ],
];

function violations(source: string): string[] {
  const possibles = FAMILLES.filter(([, noyau]) => source.includes(noyau));
  if (possibles.length === 0) return [];
  const propre = sansCommentaires(source);
  return possibles.filter(([, , motif]) => motif.test(propre)).map(([nom]) => nom);
}

describe('source guards — class families removed by lot B', () => {
  const sources = fichiers(RACINE);

  it('scans a real number of files (the guard is looking at something)', () => {
    expect(sources.length).toBeGreaterThan(200);
  });

  it('no component paints a removed family', () => {
    const fautes = sources.flatMap((chemin) =>
      violations(readFileSync(chemin, 'utf8')).map(
        (famille) => `${relative(process.cwd(), chemin)} — ${famille}`,
      ),
    );
    expect(fautes).toEqual([]);
  });
});

describe('the guard can fail — witnesses', () => {
  it.each([
    ['plain class', `<p className="text-brand-700 font-medium">x</p>`],
    ['variant prefix', `<a className="hover:text-brand-700">x</a>`],
    ['phantom on a fill', `<b className="bg-brand-700 text-primary-foreground">x</b>`],
    ['phantom secondary', `<b className="bg-secondary">x</b>`],
    ['phantom border', `<select className="border-input" />`],
    ['old hover', `cva('bg-brand-700 hover:bg-brand-600')`],
    ['old slider accent', `<input className="accent-brand-400" />`],
    [
      'class after a URL inside a string on the same line',
      `const u = 'https://ankora.be'; const c = "text-brand-700";`,
    ],
  ])('flags %s', (_nom, source) => {
    expect(violations(source)).not.toEqual([]);
  });

  it.each([
    ['decoration utility', `<a className="decoration-brand-700">x</a>`],
    ['shadow utility', `<b className="shadow-brand-700/35">x</b>`],
    ['brand text token', `<a className="text-brand-text hover:text-brand-text-strong">x</a>`],
    ['line comment naming a phantom', `// was text-primary-foreground, a phantom token`],
    ['block comment naming the old class', `/* text-brand-700 failed in dark */ const a = 1;`],
    ['JSX comment', `<div>{/* hover:bg-brand-600 was 3.75:1 */}</div>`],
    ['new hover', `cva('bg-brand-700 text-on-accent hover:bg-brand-800 active:bg-brand-900')`],
  ])('accepts %s', (_nom, source) => {
    expect(violations(source)).toEqual([]);
  });
});
