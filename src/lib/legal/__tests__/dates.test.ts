import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { formatLegalDate, LEGAL_UPDATED } from '../dates';

describe('legal page dates', () => {
  it('reads in the language of the page', () => {
    expect(formatLegalDate('2026-09-19', 'fr-BE')).toBe('19 septembre 2026');
    expect(formatLegalDate('2026-09-19', 'en')).toBe('September 19, 2026');
    expect(formatLegalDate('2026-09-19', 'de-DE')).toBe('19. September 2026');
    expect(formatLegalDate('2026-09-19', 'nl-BE')).toBe('19 september 2026');
    expect(formatLegalDate('2026-09-19', 'es-ES')).toBe('19 de septiembre de 2026');
  });

  it('does not shift a calendar date with the time zone', () => {
    expect(formatLegalDate('2026-01-01', 'fr-BE')).toBe('1 janvier 2026');
  });

  it('is the only date source of the three legal pages', () => {
    const month =
      /janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre/;
    for (const page of ['privacy', 'cgu', 'cookies'] as const) {
      const source = readFileSync(
        join(process.cwd(), `src/app/[locale]/(public)/legal/${page}/page.tsx`),
        'utf8',
      );
      expect(source).toContain(`LEGAL_UPDATED.${page}`);
      expect(source).not.toMatch(new RegExp(`'\\d{1,2} (${month.source}) \\d{4}'`));
      expect(LEGAL_UPDATED[page]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
