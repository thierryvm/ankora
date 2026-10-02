import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * This repository is PUBLIC. Tracked documentation used to quote a real
 * personal budget, and the local test profile in `scripts/dev` reused it. Both
 * now use a fictional profile (same orders of magnitude, other amounts,
 * generic descriptions).
 *
 * This guard reads every TRACKED file under `docs/`, `scripts/`, `prompts/`,
 * `.claude/`, `src/`, `e2e/`, `messages/`, `tests/`, `content/`, `.github/`,
 * `CHANGELOG.md` and `README.md` (this file excepted), and fails if a marker
 * comes back.
 *
 * The marker list is deliberately SHORT, and an AMOUNT is never written here in
 * clear: this file is published too, and a list of old amounts would rebuild,
 * in one place, the very budget it guards against. Each banned amount is kept
 * as the SHA-256 digest of its canonical form, and the scan hashes every number
 * it reads. Canonical form: no group separator, a point before the decimals,
 * the decimals as written (`1234.56`), and an integer without decimals
 * (`505`). The labels the owner chose for this guard stay as patterns: they
 * carry no amount.
 *
 * A digest removes the value from the files and from any text search. It is
 * not a secret: a short amount can be found again by hashing every candidate.
 * A list that a reader cannot rebuild would have to live outside the
 * repository, which is a CI change (secret + workflow) left to the owner.
 *
 * A Belgian brand quoted as an example of the ecosystem (a catalogue of mutual
 * funds, banks, telcos) is not personal data and stays allowed.
 *
 * `docs/retours/` is never tracked (`.gitignore`), so `git ls-files` never
 * returns it.
 */

const root = resolve(__dirname, '../..');
const SELF = 'tests/tooling/depot-public-sans-budget-reel.test.ts';

type LabelMarker = { name: string; pattern: RegExp; sample: string };
type AmountMarker = { name: string; sha256: string; context?: RegExp };

const LABEL_MARKERS: ReadonlyArray<LabelMarker> = [
  {
    name: 'real-case heading',
    pattern: /cas r[ée]el\s+@thierry/i,
    sample: '- Cas réel @thierry (x)',
  },
  {
    name: 'private notes folder',
    pattern: /_donnees-thierry/i,
    sample: 'cf. `_donnees-thierry/x.md`',
  },
  { name: 'persona label', pattern: /thierry mai 2026/i, sample: 'pour Thierry mai 2026' },
  {
    name: 'real-person fixture',
    pattern: /@?thierry'?s?\s+real|real\s+@?thierry|fixture\s+@thierry/i,
    sample: "matches @thierry's real fixture",
  },
];

// The word that names a rent, in the five languages of the app. On its own the
// rent is a common number: it is only banned on a line that names it.
const RENT_WORD = /loyer|\brent\b|huur|miete|alquiler/i;

// Digests of the canonical amounts the owner chose for this guard.
const AMOUNT_MARKERS: ReadonlyArray<AmountMarker> = [
  {
    name: 'monthly total',
    sha256: '79cffc59fb0d6ef38dc0a0b53f52b6e0c940acb75a229dc105d569d4cd488bb9',
  },
  {
    name: 'yearly equivalent',
    sha256: '4203285a3592a1f466453eda1010a477096c431fe06a054e67ab7d4852298f9c',
  },
  {
    name: 'energy amount',
    sha256: 'e363d7951086568365b7d97cbe9e1596d21881f1459fea4ecef3c4c32b81251f',
  },
  {
    name: 'rent',
    sha256: '234666d765f4c0a26cf4d96eced9155888477cb9b19e8cb48ae4ea79ce1b28de',
    context: RENT_WORD,
  },
];

const digests = new Map<string, string>();
function sha256(text: string): string {
  let digest = digests.get(text);
  if (!digest) {
    digest = createHash('sha256').update(text, 'utf8').digest('hex');
    digests.set(text, digest);
  }
  return digest;
}

// Group separators: space, no-break space, thin space, narrow no-break space,
// underscore (TS numeric separator) and both apostrophes. They are written as
// escapes on purpose: an editor once turned a literal one into a plain space.
const SEP = "[ \\xa0\\u{2009}\\u{202f}_'\\u{2019}]";
const SEP_GLOBAL = new RegExp(SEP, 'gu');
const READINGS: ReadonlyArray<{ pattern: RegExp; groupSep: RegExp; decimal: string }> = [
  // 1 234,56 · 1 234.56 · 1_234.56 · 1'234.56
  {
    pattern: new RegExp(`\\d{1,3}(?:${SEP}\\d{3})+(?:[,.]\\d+)?`, 'gu'),
    groupSep: SEP_GLOBAL,
    decimal: '[,.]',
  },
  // 1.234,56 (nl, de, es)
  { pattern: /\d{1,3}(?:\.\d{3})+(?:,\d+)?/g, groupSep: /\./g, decimal: ',' },
  // 1,234.56 (en)
  { pattern: /\d{1,3}(?:,\d{3})+(?:\.\d+)?/g, groupSep: /,/g, decimal: '\\.' },
  // 1234,56 · 1234.56 · 505
  { pattern: /\d+(?:[,.]\d+)?/g, groupSep: /(?!)/g, decimal: '[,.]' },
];

/**
 * Every number a line writes, in canonical form, under every reading of its
 * separators. A number with decimals also yields the same number without its
 * trailing zeros (« 12,50 » gives 12.50 and 12.5), and without decimals when
 * they are all zero (« 12,00 » gives 12).
 */
function amountsIn(line: string): string[] {
  const out = new Set<string>();
  for (const { pattern, groupSep, decimal } of READINGS) {
    for (const m of line.matchAll(pattern)) {
      const canonical = m[0].replace(groupSep, '').replace(new RegExp(decimal), '.');
      out.add(canonical);
      const trimmed = /^(\d+)\.(\d*?)0+$/.exec(canonical);
      if (trimmed) out.add(trimmed[2] ? `${trimmed[1]}.${trimmed[2]}` : trimmed[1]!);
    }
  }
  return [...out];
}

function amountHits(line: string, markers: ReadonlyArray<AmountMarker>): string[] {
  const seen = new Set(amountsIn(line).map(sha256));
  return markers
    .filter(({ sha256: digest, context }) => seen.has(digest) && (!context || context.test(line)))
    .map(({ name }) => name);
}

function scan(
  file: string,
  text: string,
  amountMarkers: ReadonlyArray<AmountMarker> = AMOUNT_MARKERS,
): string[] {
  const hits: string[] = [];
  text.split('\n').forEach((line, i) => {
    for (const { name, pattern } of LABEL_MARKERS) {
      if (pattern.test(line)) hits.push(`${file}:${i + 1} — ${name}`);
    }
    for (const name of amountHits(line, amountMarkers)) hits.push(`${file}:${i + 1} — ${name}`);
  });
  return hits;
}

const SCANNED = [
  'docs',
  'scripts',
  'prompts',
  '.claude',
  'src',
  'e2e',
  'messages',
  'tests',
  'content',
  '.github',
  'CHANGELOG.md',
  'README.md',
];

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...SCANNED], {
    cwd: root,
    encoding: 'utf8',
  });
  return out.split('\0').filter((f) => f && f !== SELF);
}

describe('public repository carries no real budget', () => {
  it('lists tracked files to scan (the probe is looking somewhere)', () => {
    const files = trackedFiles();
    expect(files).toContain('CHANGELOG.md');
    expect(files.some((f) => f.startsWith('docs/adr/'))).toBe(true);
    expect(files.some((f) => f.startsWith('scripts/'))).toBe(true);
    expect(files.some((f) => f.startsWith('prompts/'))).toBe(true);
    expect(files.some((f) => f.startsWith('tests/'))).toBe(true);
    expect(files.some((f) => f.startsWith('docs/retours/'))).toBe(false);
    expect(files).not.toContain(SELF);
  });

  it('every label marker catches the shape it bans, and the scan reports it (no dead regex)', () => {
    for (const { name, sample } of LABEL_MARKERS) {
      expect(scan('trap.md', `ligne neutre\n${sample}`), name).toEqual([`trap.md:2 — ${name}`]);
    }
    expect(scan('neutral.md', 'Loyer 690 € · total 1 455,37 €')).toEqual([]);
  });

  it('every amount marker is a SHA-256 digest, never an amount in clear', () => {
    for (const { name, sha256: digest } of AMOUNT_MARKERS) {
      expect(digest, name).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  // The sample is built HERE, from a fictional amount: the real ones are only
  // known by their digest, so the trap proves the mechanism, not the values.
  it('a digest catches its amount however it is written, and nothing next to it', () => {
    const constructed: AmountMarker[] = [
      { name: 'constructed total', sha256: sha256('1705.55') },
      { name: 'constructed rent', sha256: sha256('505'), context: RENT_WORD },
    ];
    const hit = (line: string) => scan('trap.md', `ligne neutre\n${line}`, constructed);

    for (const written of [
      '1 705,55 €',
      '1\xa0705,55 €',
      '1\u{202f}705,55 €',
      '1\u{2009}705,55 €',
      '1705.55',
      'x 1705,55',
      '1.705,55 €',
      '€1,705.55',
      '1_705.55',
      "1'705.55",
      '1 705,550 €',
    ]) {
      expect(hit(written), written).toEqual(['trap.md:2 — constructed total']);
    }
    for (const near of ['1 705,56 €', '11 705,55 €', '1 705,5 €', '705,55 €', '1.705,56']) {
      expect(hit(near), near).toEqual([]);
    }

    expect(hit('Loyer 505 €')).toEqual(['trap.md:2 — constructed rent']);
    expect(hit('loyer : 505,00 €')).toEqual(['trap.md:2 — constructed rent']);
    expect(hit('Rent: €505')).toEqual(['trap.md:2 — constructed rent']);
    expect(hit('Huur 505 €')).toEqual(['trap.md:2 — constructed rent']);
    expect(hit('Total 505 €')).toEqual([]);
    expect(hit('current 505')).toEqual([]);
  });

  // The guard is excluded from the scan (its label samples are traps), so it
  // checks itself for the amounts, without any context word: an example in a
  // comment once published a banned amount here.
  it('this guard writes no banned amount in clear, not even as an example', () => {
    const anywhere = AMOUNT_MARKERS.map(({ name, sha256: digest }) => ({ name, sha256: digest }));
    const hits = readFileSync(resolve(root, SELF), 'utf8')
      .split('\n')
      .flatMap((line, i) =>
        line.includes('sha256:')
          ? []
          : amountHits(line, anywhere).map((n) => `${SELF}:${i + 1} — ${n}`),
      );
    expect(hits).toEqual([]);
  });

  it('no scanned tracked file quotes a marker', () => {
    const hits: string[] = [];
    for (const file of trackedFiles()) {
      const text = readFileSync(resolve(root, file), 'utf8');
      if (text.includes('\0')) continue; // binary
      hits.push(...scan(file, text));
    }
    expect(hits).toEqual([]);
  });
});
