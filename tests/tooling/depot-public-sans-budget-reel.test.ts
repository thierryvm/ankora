import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * This repository is PUBLIC. Tracked documentation used to quote a real
 * personal budget, and the local test profile in `scripts/dev` reused it. Both
 * now use a fictional profile (same orders of magnitude, other amounts,
 * generic descriptions).
 *
 * This guard reads every TRACKED file under `docs/`, `scripts/`, `prompts/`,
 * `.claude/` and `CHANGELOG.md`, and fails if a marker comes back.
 *
 * The marker list is deliberately SHORT. Every marker written here is itself
 * published: a long list of old amounts would rebuild, in one place, the very
 * budget it guards against. So it holds only the markers the owner chose for
 * this guard (two labels, four amounts) plus one label without any amount.
 * Wider coverage would need a list kept outside the repository, which is a CI
 * change (secret + workflow) left to the owner.
 *
 * A Belgian brand quoted as an example of the ecosystem (a catalogue of mutual
 * funds, banks, telcos) is not personal data and stays allowed.
 *
 * `docs/retours/` is never tracked (`.gitignore`), so `git ls-files` never
 * returns it.
 */

const root = resolve(__dirname, '../..');

// No-break and narrow no-break spaces are written as escapes on purpose: an
// editor once turned a literal one into a plain space.
const SP = '[ \\u00a0\\u202f]?';

const MARKERS: ReadonlyArray<{ name: string; pattern: RegExp; sample: string }> = [
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
    name: 'monthly total',
    pattern: new RegExp(`(?<!\\d)1${SP}804[,.]21(?!\\d)`),
    sample: 'mensuelles 1 804,21 €',
  },
  {
    name: 'yearly equivalent',
    pattern: new RegExp(`(?<!\\d)22${SP}358[,.]52(?!\\d)`),
    sample: 'annuel 22 358,52 €',
  },
  { name: 'energy amount', pattern: /(?<![\d,.])42[,.]21(?!\d)/, sample: 'énergie 42,21 €' },
  {
    name: 'rent',
    pattern: /loyer[^\n]{0,20}(?<!\d)740(?!\d)|(?<!\d)740[^\n]{0,10}loyer/i,
    sample: 'Loyer 740 €',
  },
];

const SCANNED = ['docs', 'scripts', 'prompts', '.claude', 'CHANGELOG.md'];

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...SCANNED], {
    cwd: root,
    encoding: 'utf8',
  });
  return out.split('\0').filter(Boolean);
}

function scan(file: string, text: string): string[] {
  const hits: string[] = [];
  text.split('\n').forEach((line, i) => {
    for (const { name, pattern } of MARKERS) {
      if (pattern.test(line)) hits.push(`${file}:${i + 1} — ${name}`);
    }
  });
  return hits;
}

describe('public repository carries no real budget', () => {
  it('lists tracked files to scan (the probe is looking somewhere)', () => {
    const files = trackedFiles();
    expect(files).toContain('CHANGELOG.md');
    expect(files.some((f) => f.startsWith('docs/adr/'))).toBe(true);
    expect(files.some((f) => f.startsWith('scripts/'))).toBe(true);
    expect(files.some((f) => f.startsWith('prompts/'))).toBe(true);
    expect(files.some((f) => f.startsWith('docs/retours/'))).toBe(false);
  });

  it('every marker catches the shape it bans, and the scan reports it (no dead regex)', () => {
    for (const { name, sample } of MARKERS) {
      expect(scan('trap.md', `ligne neutre\n${sample}`), name).toEqual([`trap.md:2 — ${name}`]);
    }
    expect(scan('neutral.md', 'Loyer 690 € · total 1 455,37 €')).toEqual([]);
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
