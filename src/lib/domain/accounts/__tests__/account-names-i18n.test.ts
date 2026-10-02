import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_TYPES, isSeededDefaultName } from '../account-type';

/**
 * H1 (audit of 1 October 2026): the everyday account carried four names in the
 * interface. One name per account now; these are the ones that must not come
 * back. Case-sensitive on purpose: « Compte Principal » is the old casing,
 * « Compte principal » the decided one.
 */
const RETIRED: Record<string, readonly string[]> = {
  'fr-BE': [
    'Vie Courante',
    'Carte Quotidien',
    'compte du quotidien',
    'Dépenses du quotidien',
    'Compte Principal',
    'Compte Épargne',
    'compte Épargne',
    'compte Principal',
  ],
  en: [
    'Daily Spending',
    'Daily Card',
    'everyday account',
    'Everyday spending',
    'Main Account',
    'Savings Account',
  ],
};

const DECIDED: Record<string, Record<string, string>> = {
  'fr-BE': {
    income_bills: 'Compte principal',
    provisions: 'Compte épargne',
    daily_card: 'Vie courante',
  },
  en: {
    income_bills: 'Main account',
    provisions: 'Savings account',
    daily_card: 'Everyday account',
  },
};

function strings(node: unknown, path: string, out: Array<[string, string]>) {
  if (typeof node === 'string') out.push([path, node]);
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) strings(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

function load(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8'));
}

describe('one name per account (H1)', () => {
  for (const locale of Object.keys(RETIRED)) {
    it(`${locale}: no retired account name anywhere in the messages`, () => {
      const hits = strings(load(locale), '', []).filter(([, v]) =>
        RETIRED[locale]!.some((name) => v.includes(name)),
      );
      expect(hits).toEqual([]);
    });

    it(`${locale}: the three default names are the decided ones`, () => {
      const defaults = (load(locale).app as { accounts: { defaults: Record<string, string> } })
        .accounts.defaults;
      expect(defaults).toEqual(DECIDED[locale]);
    });
  }
});

describe('isSeededDefaultName', () => {
  it('recognises the names the database seeds, per type', () => {
    expect(isSeededDefaultName('daily_card', 'Carte Quotidien')).toBe(true);
    expect(isSeededDefaultName('daily_card', 'Vie Courante')).toBe(true);
    expect(isSeededDefaultName('income_bills', 'Compte Principal')).toBe(true);
    expect(isSeededDefaultName('provisions', 'Compte Épargne')).toBe(true);
    expect(isSeededDefaultName('provisions', 'Épargne & Provisions')).toBe(true);
  });

  it('never replaces a name the person typed, nor a default of another type', () => {
    expect(isSeededDefaultName('daily_card', 'Banque Lune')).toBe(false);
    expect(isSeededDefaultName('income_bills', 'Carte Quotidien')).toBe(false);
    expect(isSeededDefaultName('provisions', 'compte épargne')).toBe(false);
    for (const type of ACCOUNT_TYPES) expect(isSeededDefaultName(type, '')).toBe(false);
  });
});
