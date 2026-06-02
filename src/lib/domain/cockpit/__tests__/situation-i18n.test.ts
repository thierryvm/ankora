import { describe, it, expect } from 'vitest';

const LOCALES = ['fr-BE', 'en', 'de-DE', 'es-ES', 'nl-BE'] as const;

const LEAF_KEYS = [
  'heroLabel',
  'heroSubtitle',
  'voirPlan',
  'statut.vert',
  'statut.orangeCapacite',
  'statut.orangeProvisions',
  'statut.rouge',
  'nudge.orangeCapacite',
  'nudge.orangeProvisions',
  'nudge.rouge',
  'incomplet.title',
  'incomplet.body',
  'incomplet.cta',
  'flow.revenus',
  'flow.chargesFixes',
  'flow.provisions',
  'flow.resteDisponible',
  'flow.resteAVivre',
  'flow.capaciteEpargne',
  'flow.ajuster',
  'flow.parJour',
  'barAria',
] as const;

function leaf(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (typeof acc === 'object' && acc !== null && k in acc) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}

describe('dashboard.situation — i18n parity (5 locales)', () => {
  it.each(LOCALES)(
    'locale %s exposes every situation key as a non-empty string',
    async (locale) => {
      const m = (await import(`../../../../../messages/${locale}.json`)).default as {
        dashboard: { situation: unknown };
      };
      for (const key of LEAF_KEYS) {
        const value = leaf(m.dashboard.situation, key);
        expect(value, `${locale} → dashboard.situation.${key}`).toBeTypeOf('string');
        expect((value as string).length, `${locale} → dashboard.situation.${key}`).toBeGreaterThan(
          0,
        );
      }
    },
  );
});
