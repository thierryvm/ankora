// @vitest-environment node
/**
 * Holds the committed fonts to `scripts/fonts/fonts.json`, and the CSS and the
 * preloads to the same file. Written after production served, from 19 May to
 * November 2026, a Fraunces file without a single lowercase letter: every
 * display heading fell back to Inter and nothing noticed. This suite parses the
 * WOFF2 files themselves (no npm dependency: `woff2-inspect.ts` uses Node's
 * Brotli), so a subset that loses a glyph, a feature or an axis turns it red.
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FONT_PRELOADS } from '@/lib/fonts';

import manifestJson from '../fonts.json';
import { inspectWoff2, type FontReport } from '../woff2-inspect';

type Output = {
  name: string;
  file: string;
  family: string;
  style: 'normal' | 'italic';
  weight: string;
  source: string;
  range: 'latin' | 'latin-ext';
  axes: string[];
  features: string[];
  alias: Record<string, string>;
  exceptions: Record<string, string>;
  maxBytes: number;
  preload: 'layout' | null;
  bytes: number;
  sha256: string;
};

const manifest = manifestJson as unknown as {
  ranges: Record<'latin' | 'latin-ext', string>;
  required: Record<'latin' | 'latin-ext', string>;
  licences: { family: string; file: string; sha256: string }[];
  landingBudgetBytes: number;
  outputs: Output[];
};

const ROOT = path.resolve(__dirname, '../../..');
const FONTS = path.join(ROOT, 'public/fonts');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

/** `U+0000-00FF, U+0131` → the set of code points it covers. */
export function parseRange(range: string): Set<number> {
  const points = new Set<number>();
  for (const part of range.split(',')) {
    const match = /^\s*U\+([0-9A-F]+)(?:-([0-9A-F]+))?\s*$/i.exec(part);
    if (!match?.[1]) throw new Error(`Bad unicode-range part: "${part}"`);
    const start = parseInt(match[1], 16);
    const end = match[2] ? parseInt(match[2], 16) : start;
    for (let cp = start; cp <= end; cp += 1) points.add(cp);
  }
  return points;
}

const hex = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
const codePointsOf = (chars: string) => [...chars].map((c) => c.codePointAt(0) as number);

/** Required characters the font does not map, as `U+XXXX`. */
function missing(report: FontReport, required: string): string[] {
  return codePointsOf(required)
    .filter((cp) => !report.codePoints.has(cp))
    .map(hex);
}

const reports = new Map<string, FontReport>(
  manifest.outputs.map((o) => [o.file, inspectWoff2(readFileSync(path.join(FONTS, o.file)))]),
);
const reportOf = (o: Output) => reports.get(o.file) as FontReport;

describe('unicode ranges', () => {
  it('keeps latin and latin-ext disjoint, so a French page never fetches latin-ext', () => {
    const latin = parseRange(manifest.ranges.latin);
    const overlap = [...parseRange(manifest.ranges['latin-ext'])].filter((cp) => latin.has(cp));
    expect(overlap.map(hex)).toEqual([]);
  });

  it('puts every required character inside its own range', () => {
    for (const range of ['latin', 'latin-ext'] as const) {
      const declared = parseRange(manifest.ranges[range]);
      const outside = codePointsOf(manifest.required[range]).filter((cp) => !declared.has(cp));
      expect(outside.map(hex), range).toEqual([]);
    }
  });

  it('parses a range and rejects garbage (the helpers above can fail)', () => {
    expect([...parseRange('U+0041-0043, U+20AC')]).toEqual([0x41, 0x42, 0x43, 0x20ac]);
    expect(() => parseRange('U+00ZZ')).toThrow();
  });
});

describe.each(manifest.outputs)('$file', (output) => {
  it('maps every required character of its range, except the documented exceptions', () => {
    const exceptions = Object.keys(output.exceptions);
    const absent = missing(reportOf(output), manifest.required[output.range]);
    expect(absent).toEqual(absent.filter((cp) => exceptions.includes(cp)));
  });

  it('lists no stale exception (each one is still missing)', () => {
    for (const cp of Object.keys(output.exceptions)) {
      expect(reportOf(output).codePoints.has(parseInt(cp.slice(2), 16)), cp).toBe(false);
    }
  });

  it('maps nothing outside its declared unicode-range', () => {
    const declared = parseRange(manifest.ranges[output.range]);
    const stray = [...reportOf(output).codePoints].filter((cp) => !declared.has(cp));
    expect(stray.map(hex)).toEqual([]);
  });

  it('keeps exactly the OpenType features fonts.json lists', () => {
    expect([...reportOf(output).features].sort()).toEqual([...output.features].sort());
  });

  it('keeps exactly the variation axes fonts.json lists', () => {
    expect(reportOf(output).axes).toEqual(output.axes);
  });

  it('is italic only when declared italic', () => {
    expect(reportOf(output).italic).toBe(output.style === 'italic');
  });

  it('carries the first 8 hex of its SHA-256 in its name (/fonts/ is immutable)', () => {
    // New bytes must never be served under a URL a browser cached for a year.
    expect(output.file).toBe(`${output.name}.${output.sha256.slice(0, 8)}.woff2`);
  });

  it('matches the size and SHA-256 recorded in fonts.json, within its budget', () => {
    const bytes = readFileSync(path.join(FONTS, output.file));
    expect(bytes.length).toBe(output.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(output.sha256);
    expect(bytes.length).toBeLessThanOrEqual(output.maxBytes);
  });

  it('maps each alias to the very glyph of its target', () => {
    for (const [alias, target] of Object.entries(output.alias)) {
      const ids = reportOf(output).glyphIds;
      const aliasId = ids.get(parseInt(alias.slice(2), 16));
      expect(aliasId, alias).toBeDefined();
      expect(aliasId).toBe(ids.get(parseInt(target.slice(2), 16)));
    }
  });
});

describe('families', () => {
  it('keeps tnum in the Inter file that carries the digits', () => {
    // Every `tabular-nums` figure outside the mono is Inter. The digits live in
    // the latin file; latin-ext has none, so the subsetter rightly drops tnum
    // there (its feature list in fonts.json says so, and is tested exactly).
    const inter = manifest.outputs.find((o) => o.name === 'inter/inter-latin') as Output;
    expect(reportOf(inter).codePoints.has(0x30)).toBe(true);
    expect(reportOf(inter).features.has('tnum')).toBe(true);
  });

  it('keeps U+202F in the mono latin file, as the same glyph as U+00A0', () => {
    const mono = manifest.outputs.find(
      (o) => o.name === 'jetbrains-mono/jetbrains-mono-latin',
    ) as Output;
    const ids = reportOf(mono).glyphIds;
    expect(ids.get(0x202f)).toBeDefined();
    expect(ids.get(0x202f)).toBe(ids.get(0x00a0));
  });

  it('gives both files of a face the same vertical metrics (no line-height jump)', () => {
    const faces = new Map<string, FontReport[]>();
    for (const o of manifest.outputs) {
      const key = `${o.family}/${o.style}`;
      faces.set(key, [...(faces.get(key) ?? []), reportOf(o)]);
    }
    for (const [key, pair] of faces) {
      expect(pair, key).toHaveLength(2);
      expect(pair[0]?.metrics, key).toEqual(pair[1]?.metrics);
    }
  });

  it('keeps the landing font payload within budget (production paid 498 KB)', () => {
    // What `/` downloads: the four latin files (measured in the browser by
    // e2e/fonts.spec.ts), never a latin-ext one.
    const landingFiles = [
      'inter/inter-latin',
      'fraunces/fraunces-latin',
      'fraunces/fraunces-italic-latin',
      'jetbrains-mono/jetbrains-mono-latin',
    ];
    const landing = manifest.outputs.filter((o) => landingFiles.includes(o.name));
    expect(landing).toHaveLength(landingFiles.length);
    const total = landing.reduce((sum, o) => sum + o.bytes, 0);
    expect(total).toBeLessThanOrEqual(manifest.landingBudgetBytes);
  });

  it('detects a missing glyph (negative control on a real file)', () => {
    const inter = manifest.outputs.find((o) => o.name === 'inter/inter-latin') as Output;
    expect(missing(reportOf(inter), 'a一')).toEqual(['U+4E00']);
  });
});

describe('globals.css', () => {
  const css = read('src/app/globals.css');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
    const props = new Map<string, string>();
    for (const decl of (m[1] ?? '').split(';')) {
      const at = decl.indexOf(':');
      if (at < 0) continue;
      props.set(
        decl.slice(0, at).trim(),
        decl
          .slice(at + 1)
          .replace(/\s+/g, ' ')
          .trim(),
      );
    }
    return props;
  });

  it('declares one @font-face per output, in fonts.json order (latin-ext before latin)', () => {
    expect(faces.map((f) => f.get('src'))).toEqual(
      manifest.outputs.map((o) => `url('/fonts/${o.file}') format('woff2')`),
    );
  });

  it.each(manifest.outputs.map((o, i) => [o.file, o, i] as const))(
    '%s: family, weight, style, swap and unicode-range match fonts.json',
    (_file, output, index) => {
      const face = faces[index];
      expect(face?.get('font-family')).toBe(`'${output.family}'`);
      expect(face?.get('font-weight')).toBe(output.weight);
      expect(face?.get('font-style')).toBe(output.style);
      expect(face?.get('font-display')).toBe('swap');
      expect(face?.get('unicode-range')).toBe(manifest.ranges[output.range]);
    },
  );

  it('references no font file that is not in fonts.json', () => {
    const urls = [...css.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map((m) => m[1]);
    expect(urls.sort()).toEqual(manifest.outputs.map((o) => o.file).sort());
  });
});

describe('preloads', () => {
  it('src/lib/fonts.ts preloads exactly what fonts.json flags, per scope', () => {
    for (const scope of ['layout'] as const) {
      expect([...FONT_PRELOADS[scope]].sort(), scope).toEqual(
        manifest.outputs
          .filter((o) => o.preload === scope)
          .map((o) => `/fonts/${o.file}`)
          .sort(),
      );
    }
  });

  it('preloads nothing fonts.json does not flag', () => {
    const flagged = manifest.outputs.filter((o) => o.preload !== null).map((o) => o.preload);
    expect(new Set(flagged)).toEqual(new Set(Object.keys(FONT_PRELOADS)));
  });

  it('the locale layout renders its scope', () => {
    expect(read('src/app/[locale]/layout.tsx')).toMatch(/<FontPreloads scope="layout" \/>/);
  });

  it('passes crossOrigin, without which a font preload downloads twice', () => {
    expect(read('src/lib/fonts.tsx')).toMatch(
      /as="font"\s*type="font\/woff2"\s*crossOrigin="anonymous"/,
    );
  });
});

describe('licences', () => {
  it.each(manifest.licences)(
    '$family ships its OFL.txt, unchanged, next to its fonts',
    (licence) => {
      const file = path.join(FONTS, licence.file);
      expect(existsSync(file)).toBe(true);
      const bytes = readFileSync(file);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(licence.sha256);
      const text = bytes.toString('utf8');
      expect(text).toMatch(/SIL Open Font License, Version 1\.1/);
      // A Reserved Font Name would forbid publishing a modified version (our
      // subsets) under the original name. It is declared in the copyright
      // statement, before the licence body (which only defines the term).
      const statement = text.slice(0, text.indexOf('This Font Software is licensed'));
      expect(statement.length).toBeGreaterThan(0);
      expect(statement).not.toMatch(/Reserved Font Name/i);
    },
  );

  it('every output family has a licence', () => {
    const licensed = new Set(manifest.licences.map((l) => l.family));
    for (const o of manifest.outputs) expect(licensed.has(o.family), o.family).toBe(true);
  });
});
