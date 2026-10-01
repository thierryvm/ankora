import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { AUCUNE_OPERATION } from '@/lib/domain/cockpit/operations-du-mois';
import { ecartDuMois, sensDeLEcart } from '@/lib/domain/cockpit/rythme';
import { calculerSituationDuMois } from '@/lib/domain/cockpit/situation-mois';
import type { PaymentLedger, ReferencePeriod } from '@/lib/domain/cockpit/types';

/**
 * H3, tour 65 bis — the « Rythme du mois » card and the « Il te reste »
 * situation tell the same story. The card's gap is taken from the SAME
 * spending as « Il te reste » (every expense recorded for the month, a
 * post-dated one included) and from the SAME budget (`resteDisponible`).
 *
 * Cross test: the very same inputs go through `calculerSituationDuMois` and
 * through `ecartDuMois`; a negative « Il te reste » never meets a margin.
 * Fictitious household (public repo): the 505 / 705 family.
 */
const REF: ReferencePeriod = { year: 2026, month: 10 };
const NO_PAYMENTS: PaymentLedger = new Map();

function situation(revenus: number, depenses: number, joursEcoules: number) {
  return calculerSituationDuMois({
    revenus: new Decimal(revenus),
    charges: [],
    soldeEpargneActuel: new Decimal(0),
    payments: NO_PAYMENTS,
    ref: REF,
    engagementsMensuels: new Decimal(0),
    depensesDuMois: new Decimal(depenses),
    operations: AUCUNE_OPERATION,
    joursEcoules,
    joursDuMois: 31,
  });
}

describe('ecartDuMois — the gap reads the same spending as « Il te reste »', () => {
  it('a month overspent by post-dated lines is over the rhythm, never a margin', () => {
    // Day 1: nothing spent up to today, but 689.26 € recorded for the month
    // (dated later). « Il te reste » = 505 − 689.26 = −184.26.
    const s = situation(505, 689.26, 1);
    expect(s.ilTeReste.toFixed(2)).toBe('-184.26');

    const ecart = ecartDuMois({
      budget: s.resteDisponible,
      depensesDuMois: s.depensesDuMois,
      jour: 1,
      joursDuMois: 31,
    });
    expect(ecart).not.toBeNull();
    expect(sensDeLEcart(ecart!)).toBe('dessus');
    // 689.26 − 505 × 1 ÷ 31 (16.29) = 672.97 over the rhythm.
    expect(ecart!.toFixed(2)).toBe('672.97');
  });

  it('same inputs → same sign, on a grid of budgets, spendings and days', () => {
    for (const revenus of [505, 705]) {
      for (const depenses of [0, 12.4, 250, 504.6, 505, 505.3, 705, 900]) {
        for (const jour of [0, 1, 15, 31]) {
          const s = situation(revenus, depenses, jour);
          const ecart = ecartDuMois({
            budget: s.resteDisponible,
            depensesDuMois: s.depensesDuMois,
            jour,
            joursDuMois: 31,
          });
          if (s.ilTeReste.lt(0) && ecart) {
            expect(sensDeLEcart(ecart), `${revenus}/${depenses}/j${jour}`).not.toBe('marge');
          }
          if (s.ilTeReste.lt(-0.5) && ecart) {
            expect(sensDeLEcart(ecart), `${revenus}/${depenses}/j${jour}`).toBe('dessus');
          }
        }
      }
    }
  });

  it('keeps the margin when the month is really under its rhythm', () => {
    // 705 budget, day 15 of 31: rhythm 341.13 ; 250 spent → 91.13 of margin.
    const s = situation(705, 250, 15);
    const ecart = ecartDuMois({
      budget: s.resteDisponible,
      depensesDuMois: s.depensesDuMois,
      jour: 15,
      joursDuMois: 31,
    });
    expect(sensDeLEcart(ecart!)).toBe('marge');
    expect(ecart!.toFixed(2)).toBe('-91.13');
  });

  it('has no gap without a positive budget', () => {
    expect(
      ecartDuMois({
        budget: new Decimal(0),
        depensesDuMois: new Decimal(10),
        jour: 3,
        joursDuMois: 31,
      }),
    ).toBeNull();
  });
});
