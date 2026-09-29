import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';

/**
 * "sur 1 jours" was shown on the Categories card of the Expenses page on the
 * first day of a month: the day count was interpolated into a fixed plural.
 * Every message that counts elapsed days must go through an ICU plural.
 */
const LOCALES = ['fr-BE', 'nl-BE', 'en', 'de-DE', 'es-ES'] as const;

// "1 <plural noun>" in each locale — the wrong form for a single day.
const WRONG_SINGULAR = /\b1 (jours|days|dagen|Tage|días)\b/;

function message(locale: string, path: string): string {
  const all = JSON.parse(
    readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8'),
  ) as Record<string, unknown>;
  const found = path.split('.').reduce<unknown>((node, key) => {
    return node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined;
  }, all);
  if (typeof found !== 'string') throw new Error(`${locale}: ${path} missing`);
  return found;
}

function findKeyPath(locale: string, leaf: string): string {
  const all = JSON.parse(
    readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8'),
  ) as Record<string, unknown>;
  const walk = (node: unknown, prefix: string): string | null => {
    if (!node || typeof node !== 'object') return null;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (k === leaf && typeof v === 'string') return p;
      const deeper = walk(v, p);
      if (deeper) return deeper;
    }
    return null;
  };
  const p = walk(all, '');
  if (!p) throw new Error(`${locale}: ${leaf} missing`);
  return p;
}

describe('elapsed-day counts use an ICU plural (five locales)', () => {
  for (const locale of LOCALES) {
    it(`${locale}: perDayElapsed reads a singular for one day`, () => {
      const text = new IntlMessageFormat(
        message(locale, findKeyPath(locale, 'perDayElapsed')),
        locale,
      ).format({ amount: '5,05 €', days: 1 }) as string;
      expect(text).not.toMatch(WRONG_SINGULAR);
      expect(text).toContain('1');
    });

    it(`${locale}: projectionOp reads a singular for one elapsed day`, () => {
      const text = new IntlMessageFormat(
        message(locale, findKeyPath(locale, 'projectionOp')),
        locale,
      ).format({ depense: '5,05 €', jours: 30, ecoules: 1 }) as string;
      expect(text).not.toMatch(WRONG_SINGULAR);
    });

    it(`${locale}: perDayElapsed keeps the plural for several days`, () => {
      const text = new IntlMessageFormat(
        message(locale, findKeyPath(locale, 'perDayElapsed')),
        locale,
      ).format({ amount: '5,05 €', days: 12 }) as string;
      expect(text).toContain('12');
    });
  }
});
