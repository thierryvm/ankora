import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { LOCALES } from '@/i18n/routing';

type Json = Record<string, unknown>;

function loadMessages(locale: string): Json {
  const file = path.resolve(process.cwd(), 'messages', `${locale}.json`);
  return JSON.parse(readFileSync(file, 'utf-8')) as Json;
}

function collectKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  const entries = Object.entries(obj as Json);
  if (entries.length === 0) return [prefix];
  return entries.flatMap(([key, value]) => collectKeys(value, prefix ? `${prefix}.${key}` : key));
}

describe('messages parity', () => {
  const reference = loadMessages('fr-BE');
  const referenceKeys = new Set(collectKeys(reference));

  for (const locale of LOCALES) {
    if (locale === 'fr-BE') continue;

    it(`${locale} has the same key set as fr-BE`, () => {
      const keys = new Set(collectKeys(loadMessages(locale)));
      const missing = [...referenceKeys].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !referenceKeys.has(k));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });
  }
});
