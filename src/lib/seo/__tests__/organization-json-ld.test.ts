import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { brand } from '@/lib/brand';
import { buildOrganizationJsonLd } from '../organization-json-ld';

describe('Organization JSON-LD', () => {
  const ld = buildOrganizationJsonLd('desc');

  it('names a contact point with the public address of brand.ts', () => {
    expect(ld.contactPoint['@type']).toBe('ContactPoint');
    expect(ld.contactPoint.email).toBe(brand.contactEmail);
  });

  it('gives the city and the country, nothing more precise', () => {
    expect(ld.address).toEqual({
      '@type': 'PostalAddress',
      addressLocality: 'Bruxelles',
      addressCountry: 'BE',
    });
  });

  it('points its logo at a file that exists', () => {
    expect(ld.logo.endsWith('/brand/logo.svg')).toBe(true);
    expect(() => readFileSync(join(process.cwd(), 'public/brand/logo.svg'))).not.toThrow();
  });

  it('is the one the layout renders, and the only Organization in the app', () => {
    const layout = readFileSync(join(process.cwd(), 'src/app/[locale]/layout.tsx'), 'utf8');
    expect(layout).toContain('buildOrganizationJsonLd(');
    const landing = readFileSync(join(process.cwd(), 'src/app/[locale]/(public)/page.tsx'), 'utf8');
    expect(landing).not.toMatch(/['"]Organization['"]/);
    expect(landing).not.toContain('buildOrganizationJsonLd');
  });
});
