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

  it('survives the JSON round trip the script tag relies on', () => {
    expect(JSON.parse(JSON.stringify(ld))).toEqual(ld);
  });

  it('is declared once: the landing page does not add a second Organization', () => {
    const landing = readFileSync(join(process.cwd(), 'src/app/[locale]/(public)/page.tsx'), 'utf8');
    expect(landing).not.toMatch(/'@type':\s*'Organization'/);
  });
});
