import { describe, expect, it } from 'vitest';

import { paymentMonthsFromFrequency } from '@/lib/domain/charges';
import type { ChargeFrequency } from '@/lib/domain/types';

// @ts-expect-error — plain JS module with no type declarations, imported here
// precisely so the untyped mirror is held against the typed original.
import { moisDePaiement } from '../lib/payment-months.mjs';

/**
 * The seed scripts cannot import the domain function (TypeScript + `@/` path
 * alias, neither of which plain `node` resolves), so they carry a mirror in
 * `scripts/dev/lib/payment-months.mjs`. This test is what makes that mirror
 * trustworthy: it fails the moment either side changes alone.
 *
 * It exists because the mirror was previously written *inline in the seed
 * script and never checked* — and it had already drifted. Its `annual` branch
 * returned the raw anchor, so an out-of-range month 13 yielded `[13]` where
 * the domain clamps to `[12]`. Harmless for the months the script happens to
 * pass today, which is exactly why nothing caught it.
 */

const FREQUENCES: ChargeFrequency[] = ['monthly', 'quarterly', 'semiannual', 'annual'];
const MOIS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe('parité seed ↔ domaine sur payment_months', () => {
  it.each(FREQUENCES)('%s — même calendrier pour les douze mois d ancrage', (frequency) => {
    for (const mois of MOIS) {
      expect(moisDePaiement(frequency, mois), `ancrage ${mois}`).toEqual(
        paymentMonthsFromFrequency(frequency, mois),
      );
    }
  });

  // Hors [1..12] : le cas où les deux implémentations divergent le plus
  // facilement, parce qu'un `((m - 1) % 12) + 1` posé par réflexe *enroule*
  // là où le domaine *plafonne*. C'est la divergence qui existait réellement.
  it.each([-5, 0, 13, 24, Number.NaN])('ancrage hors bornes (%s) traité à l identique', (mois) => {
    for (const frequency of FREQUENCES) {
      expect(moisDePaiement(frequency, mois), `${frequency} / ${mois}`).toEqual(
        paymentMonthsFromFrequency(frequency, mois),
      );
    }
  });

  it('refuse une fréquence inconnue plutôt que de semer un calendrier arbitraire', () => {
    expect(() => moisDePaiement('weekly', 1)).toThrow(/fréquence inconnue/);
  });
});
