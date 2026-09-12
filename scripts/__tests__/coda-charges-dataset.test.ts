import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertWritableDataset,
  DEFAULT_LOCAL_DATASET_PATH,
  FICTIONAL_DATASET,
  codaDatasetSchema,
  loadCodaDataset,
  type CodaDataset,
} from '../lib/coda-charges-dataset';

const ROOT = join(__dirname, '..', '..');

/** A small valid dataset, distinct from the fictional one. */
const LOCAL_DATASET: CodaDataset = {
  categories: [
    { name: 'Test category A', color: '#123456', icon: 'home', kind: 'fixed' },
    { name: 'Test category B', color: '#ABCDEF', icon: 'wallet', kind: 'variable' },
  ],
  charges: [
    {
      label: 'Test charge 1',
      category: 'Test category A',
      amount: 10,
      frequency: 'monthly',
      dueMonth: 1,
      paidFrom: 'principal',
    },
    {
      label: 'Test charge 2',
      category: 'Test category B',
      amount: 120,
      frequency: 'annual',
      dueMonth: 12,
      paidFrom: 'epargne',
      notes: 'Test note',
    },
  ],
};

describe('loadCodaDataset', () => {
  let dir: string;
  let localPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'coda-dataset-'));
    localPath = join(dir, 'import-coda-charges.local.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('uses the local file when it exists and is valid', () => {
    writeFileSync(localPath, JSON.stringify(LOCAL_DATASET), 'utf8');

    const loaded = loadCodaDataset({ localPath });

    expect(loaded.source).toBe('local');
    expect({ categories: loaded.categories, charges: loaded.charges }).toEqual(LOCAL_DATASET);
    // Control: the local data must not be confused with the fictional set.
    expect(loaded.charges).not.toEqual(FICTIONAL_DATASET.charges);
  });

  it('falls back to the fictional dataset when the local file is absent', () => {
    const loaded = loadCodaDataset({ localPath });

    expect(loaded.source).toBe('fictional');
    expect({ categories: loaded.categories, charges: loaded.charges }).toEqual(FICTIONAL_DATASET);
  });

  it('uses the injected fs helpers', () => {
    const loaded = loadCodaDataset({
      localPath: 'virtual.json',
      exists: (p) => p === 'virtual.json',
      readFile: () => JSON.stringify(LOCAL_DATASET),
    });

    expect(loaded.source).toBe('local');
    expect(loaded.categories).toEqual(LOCAL_DATASET.categories);
  });

  it('throws on unreadable JSON, naming the path but not the content', () => {
    const sentinel = 'SENTINEL-VALUE-4242';
    writeFileSync(localPath, `{ "categories": [ ${sentinel}`, 'utf8');

    let caught: unknown;
    try {
      loadCodaDataset({ localPath });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain(localPath);
    expect(message).not.toContain(sentinel);
  });

  it('throws when a charge references an unknown category, without echoing the value', () => {
    const sentinelCategory = 'Sentinel-Category-9731';
    const invalid = {
      ...LOCAL_DATASET,
      charges: [{ ...LOCAL_DATASET.charges[0], category: sentinelCategory }],
    };
    writeFileSync(localPath, JSON.stringify(invalid), 'utf8');

    let caught: unknown;
    try {
      loadCodaDataset({ localPath });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain(localPath);
    expect(message).not.toContain(sentinelCategory);
  });

  it('throws on an unexpected key, without echoing the value', () => {
    const sentinelValue = 'Sentinel-Extra-5518';
    const invalid = {
      ...LOCAL_DATASET,
      charges: [{ ...LOCAL_DATASET.charges[0], iban: sentinelValue }],
    };
    writeFileSync(localPath, JSON.stringify(invalid), 'utf8');

    let caught: unknown;
    try {
      loadCodaDataset({ localPath });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain(localPath);
    expect(message).not.toContain(sentinelValue);
  });

  it('points by default at the gitignored local file at the repository root', () => {
    expect(DEFAULT_LOCAL_DATASET_PATH).toBe(
      join(process.cwd(), 'scripts', 'import-coda-charges.local.json'),
    );
  });
});

describe('codaDatasetSchema', () => {
  it('rejects duplicate category names', () => {
    const duplicated = {
      ...LOCAL_DATASET,
      categories: [LOCAL_DATASET.categories[0], LOCAL_DATASET.categories[0]],
      charges: [LOCAL_DATASET.charges[0]],
    };
    expect(codaDatasetSchema.safeParse(duplicated).success).toBe(false);
  });

  it.each([
    ['a non-positive amount', { amount: 0 }],
    ['an infinite amount', { amount: Number.POSITIVE_INFINITY }],
    ['a due month out of range', { dueMonth: 13 }],
    ['a non-integer due month', { dueMonth: 1.5 }],
    ['an unknown frequency', { frequency: 'weekly' }],
    ['an unknown paidFrom', { paidFrom: 'other' }],
    ['an empty label', { label: '' }],
    // The database checks char_length(label) between 1 and 120 and
    // char_length(notes) <= 500 (20260416000001_initial_schema.sql). The import
    // wipes the workspace before inserting, so a row the database would reject
    // must be rejected here, before anything destructive runs.
    ['a label longer than the 120-character column', { label: 'x'.repeat(121) }],
    ['notes longer than the 500-character column', { notes: 'x'.repeat(501) }],
  ])('rejects a charge with %s', (_, patch) => {
    const invalid = { ...LOCAL_DATASET, charges: [{ ...LOCAL_DATASET.charges[0], ...patch }] };
    expect(codaDatasetSchema.safeParse(invalid).success).toBe(false);
  });

  it('accepts the reference local dataset (control for the rejections above)', () => {
    expect(codaDatasetSchema.safeParse(LOCAL_DATASET).success).toBe(true);
  });
});

describe('FICTIONAL_DATASET', () => {
  it('passes the schema', () => {
    expect(codaDatasetSchema.safeParse(FICTIONAL_DATASET).success).toBe(true);
  });

  it('is a complete made-up sample: 9 categories, 23 charges, the last 5 with notes', () => {
    expect(FICTIONAL_DATASET.categories).toHaveLength(9);
    expect(FICTIONAL_DATASET.charges).toHaveLength(23);
    expect(FICTIONAL_DATASET.charges.slice(-5).every((c) => Boolean(c.notes))).toBe(true);
  });

  it('covers every frequency and both paidFrom values', () => {
    const frequencies = new Set(FICTIONAL_DATASET.charges.map((c) => c.frequency));
    const sources = new Set(FICTIONAL_DATASET.charges.map((c) => c.paidFrom));
    expect([...frequencies].sort()).toEqual(['annual', 'monthly', 'quarterly', 'semiannual']);
    expect([...sources].sort()).toEqual(['epargne', 'principal']);
  });
});

describe('assertWritableDataset', () => {
  it('refuses to write the fictional dataset without an explicit flag', () => {
    expect(() =>
      assertWritableDataset('fictional', { dryRun: false, allowFictional: false }),
    ).toThrow(/--allow-fictional/);
  });

  it.each([
    ['a dry run of the fictional dataset', 'fictional', { dryRun: true, allowFictional: false }],
    [
      'the fictional dataset seeded on purpose',
      'fictional',
      { dryRun: false, allowFictional: true },
    ],
    ['a write of the local dataset', 'local', { dryRun: false, allowFictional: false }],
  ] as const)('allows %s', (_, source, flags) => {
    expect(() => assertWritableDataset(source, flags)).not.toThrow();
  });
});

describe('regression guard — no real e-mail address in the import sources', () => {
  const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

  it.each(['scripts/import-coda-charges.ts', 'scripts/lib/coda-charges-dataset.ts'])(
    '%s only mentions example.com addresses',
    (file) => {
      const text = readFileSync(join(ROOT, file), 'utf8');
      const domains = [...text.matchAll(EMAIL)].map((m) => m[1]?.toLowerCase());
      // Count only: a failure must not print the address it caught.
      const foreign = domains.filter((d) => d !== 'example.com').length;
      expect(foreign, `${file} contains an address outside example.com`).toBe(0);
    },
  );
});
