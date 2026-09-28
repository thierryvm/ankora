import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Tour 59 — `accounts.balance` has no reader.
 *
 * Since voie A (21 September 2026) the balance of an account is its latest
 * statement plus the operations written since (`accountBalanceView`). The
 * column only follows the statements, so any screen reading it shows the
 * balance of the last statement, before every transfer and spending noted
 * after it. This scan fails as soon as a query on the `accounts` table names
 * that column, selects every column (`'*'` or no argument), or reads it nested
 * from another table.
 *
 * Not caught, and legitimate: the art. 20 export reads every table through
 * `.from(table)` with a variable name; SQL (the sign-up trigger) is out of a
 * source scan. The real guarantee is dropping the column (ADR-045).
 *
 * The allow-list is explicit: a file, and the ONLY form allowed in it.
 */
const ALLOWED: Record<string, RegExp> = {
  // `syncBalanceColumn` WRITES the column from the latest statement, so it
  // stays consistent until the contraction removes it. A read next to it fails.
  'src/lib/actions/operations.ts': /\.update\(\{\s*balance:/,
};

const ROOT = join(__dirname, '..', '..', '..', '..');
const SRC = join(ROOT, 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Every chained query on `accounts`, up to the end of its statement. */
function accountQueries(text: string): string[] {
  const out: string[] = [];
  const re = /\.from\(\s*['"`]accounts['"`]\s*\)/g;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const rest = text.slice(m.index);
    const end = rest.indexOf(';');
    out.push(end === -1 ? rest : rest.slice(0, end));
  }
  return out;
}

function offendingQueries(text: string, allowed?: RegExp): string[] {
  const direct = accountQueries(text).filter(
    (q) =>
      !(allowed && allowed.test(q)) &&
      (/\bbalance\b/.test(q) || /\.select\(\s*(['"`]\*['"`])?\s*\)/.test(q)),
  );
  // A nested read from another table: `.select('id, accounts(balance)')`.
  const nested = text.match(/['"`][^'"`]*\baccounts[\w!]*\([^)]*\bbalance\b[^'"`]*['"`]/g) ?? [];
  return [...direct, ...nested];
}

describe('accounts.balance — no reader outside the allow-list', () => {
  it('the scan itself sees every form of read, and ignores a clean query', () => {
    expect(offendingQueries(".from('accounts').select('kind, balance').eq('a', 1);")).toHaveLength(
      1,
    );
    expect(offendingQueries(".from('accounts').select('*');")).toHaveLength(1);
    expect(offendingQueries(".from('accounts').select();")).toHaveLength(1);
    expect(offendingQueries(".from('accounts')\n\n  .select('balance');")).toHaveLength(1);
    expect(offendingQueries(".from('workspaces').select('id, accounts(balance)');")).toHaveLength(
      1,
    );
    expect(offendingQueries(".from('accounts').select('kind, label');")).toHaveLength(0);
    expect(offendingQueries(".from('charges').select('balance');")).toHaveLength(0);
  });

  it('the allowed form is the write, never a read', () => {
    const allowed = ALLOWED['src/lib/actions/operations.ts'];
    expect(
      offendingQueries(".from('accounts').update({ balance: 1 }).eq('a', 1);", allowed),
    ).toHaveLength(0);
    expect(offendingQueries(".from('accounts').select('balance');", allowed)).toHaveLength(1);
  });

  it('no source file reads the column', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(100);
    const offenders = files
      .map((f) => relative(ROOT, f).split(sep).join('/'))
      .filter(
        (rel) => offendingQueries(readFileSync(join(ROOT, rel), 'utf8'), ALLOWED[rel]).length > 0,
      );
    expect(offenders).toEqual([]);
  });

  it('each allowed entry still matches its write (an entry that matches nothing is removed)', () => {
    for (const [rel, allowed] of Object.entries(ALLOWED)) {
      const text = readFileSync(join(ROOT, rel), 'utf8');
      expect(offendingQueries(text).length).toBeGreaterThan(0);
      expect(offendingQueries(text, allowed)).toEqual([]);
    }
  });
});
