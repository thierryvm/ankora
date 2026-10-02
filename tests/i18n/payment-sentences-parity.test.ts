import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { LOCALES } from '@/i18n/routing';

type Json = { app: { charges: Record<string, string> } };

function load(locale: string): Json {
  const file = path.resolve(process.cwd(), 'messages', `${locale}.json`);
  return JSON.parse(readFileSync(file, 'utf-8')) as Json;
}

// ICU argument names, e.g. {month}, ignoring plural/select bodies (none here).
function params(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
}

describe('payment sentences in the five languages', () => {
  const expected: Record<string, string[]> = {
    paymentFollowed: ['amount', 'month', 'previous'],
    paymentKept: ['amount', 'month'],
  };

  for (const locale of LOCALES) {
    for (const [key, wanted] of Object.entries(expected)) {
      it(`${locale} has ${key} with the parameters ${wanted.join(', ')}`, () => {
        const message = load(locale).app.charges[key];
        expect(typeof message).toBe('string');
        expect(params(message as string)).toEqual(wanted);
      });
    }
  }
});
