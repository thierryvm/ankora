import { describe, expect, it } from 'vitest';

import {
  confronterPortes,
  deriverInstallmentsTotal,
  ecartRelatif,
  totalDivergeSuffisamment,
  type DeriverHorizonOptions,
  type PorteHorizon,
} from '../horizon';
import { endPeriod, type Commitment } from '../schedule';

/**
 * THE DEGRADED CASE IS THE NORMAL CASE.
 *
 * A user who lost the contract of a car loan: no rate, no original capital,
 * no original term. They know 230 €/month. A form that demands the rate is a
 * form that gets abandoned — so the conversion is designed on this case, and
 * the three doors below are the only questions it may ask.
 *
 * The reference dataset, and the number every door must land on:
 *   Crédit auto · 230 €/mois · 1ʳᵉ échéance 15/03/2024 · 60 mensualités
 *   fin 15/02/2029 · **35 échéances restantes = 8 050 €**
 *
 * Arithmetic: March 2024 + 59 months = February 2029 (the 60th). Paid from
 * March 2024 to March 2026 = 25, so 60 − 25 = 35 remain from April 2026 on,
 * and 35 × 230 = 8 050.
 */

/** Anchor = the NEXT instalment, April 2026 (locked decision D3). */
const OPTS: DeriverHorizonOptions = {
  anchor: { year: 2026, month: 4 },
  installmentAmount: 230,
  frequency: 'monthly',
};

const PORTE_DATE: PorteHorizon = { kind: 'dateDeFin', year: 2029, month: 2 };
const PORTE_COUNT: PorteHorizon = { kind: 'echeancesRestantes', count: 35 };
const PORTE_SOLDE: PorteHorizon = { kind: 'soldeRestantDu', balance: 8050 };

describe('the three doors, on the reference car loan', () => {
  it('date de fin février 2029 → 35 échéances', () => {
    // (2029·12 + 1) − (2026·12 + 3) = 34 months, + 1 for the anchor itself = 35
    expect(deriverInstallmentsTotal(PORTE_DATE, OPTS)).toBe(35);
  });

  it('35 échéances restantes → 35 (no derivation at all)', () => {
    expect(deriverInstallmentsTotal(PORTE_COUNT, OPTS)).toBe(35);
  });

  it('solde restant dû 8 050 € → 35 (the door that survives a lost contract)', () => {
    // 8 050 / 230 = 35 exactly
    expect(deriverInstallmentsTotal(PORTE_SOLDE, OPTS)).toBe(35);
  });

  it('the round trip closes: 35 instalments from April 2026 end in February 2029', () => {
    const c: Commitment = {
      id: 'credit-auto',
      kind: 'debt',
      totalAmount: 35 * 230,
      installmentAmount: 230,
      installmentsTotal: 35,
      startYear: 2026,
      startMonth: 4,
      paymentDay: 15,
      frequency: 'monthly',
      isActive: true,
    };
    // April 2026 + 34 months = February 2029
    expect(endPeriod(c)).toEqual({ year: 2029, month: 2 });
    expect(c.totalAmount).toBe(8050);
  });
});

describe('a door that yields nothing yields null, never a wrong number', () => {
  it('an end date before the anchor', () => {
    expect(deriverInstallmentsTotal({ kind: 'dateDeFin', year: 2025, month: 1 }, OPTS)).toBeNull();
  });

  it('a zero or negative instalment count', () => {
    expect(deriverInstallmentsTotal({ kind: 'echeancesRestantes', count: 0 }, OPTS)).toBeNull();
  });

  it('a balance smaller than half an instalment rounds to 0 → null', () => {
    // round(40 / 230) = round(0.17…) = 0
    expect(deriverInstallmentsTotal({ kind: 'soldeRestantDu', balance: 40 }, OPTS)).toBeNull();
  });

  it('an end date IN the anchor month is one instalment, not zero', () => {
    expect(deriverInstallmentsTotal({ kind: 'dateDeFin', year: 2026, month: 4 }, OPTS)).toBe(1);
  });

  it('a quarterly cadence counts cycles, not months', () => {
    // April 2026 → April 2027 = 12 months = 4 cycles, + 1 for the anchor = 5
    expect(
      deriverInstallmentsTotal(
        { kind: 'dateDeFin', year: 2027, month: 4 },
        { ...OPTS, frequency: 'quarterly' },
      ),
    ).toBe(5);
  });
});

describe('confronting the doors — redundancy is a gift, not a duplicate', () => {
  it('the three doors converge, and nothing is reported', () => {
    const out = confronterPortes([PORTE_DATE, PORTE_COUNT, PORTE_SOLDE], OPTS);
    expect(out?.installmentsTotal).toBe(35);
    expect(out?.porteRetenue).toBe('echeancesRestantes');
    expect(out?.ecarts).toEqual([]);
  });

  it('two doors that disagree are BOTH reported, and neither is corrected', () => {
    // 7 360 / 230 = 32 exactly — three instalments short of the count door
    const out = confronterPortes([PORTE_COUNT, { kind: 'soldeRestantDu', balance: 7360 }], OPTS);
    expect(out?.installmentsTotal).toBe(35);
    expect(out?.ecarts).toEqual([{ porte: 'soldeRestantDu', installmentsTotal: 32 }]);
  });

  it('one door alone is enough', () => {
    expect(confronterPortes([PORTE_SOLDE], OPTS)?.installmentsTotal).toBe(35);
  });

  it('no usable door → null, and the caller must leave the charge as a charge', () => {
    expect(confronterPortes([], OPTS)).toBeNull();
    expect(confronterPortes([{ kind: 'echeancesRestantes', count: 0 }], OPTS)).toBeNull();
  });
});

describe('the total remembered from memory — confronted, never arbitrated', () => {
  it("a remembered 13 300 € against the schedule's 13 800 € is a 3,6 % gap", () => {
    // 60 × 230 = 13 800 ; |13 800 − 13 300| / 13 800 = 500 / 13 800 = 0,036231…
    const ecart = ecartRelatif(13_300, 60 * 230);
    expect(ecart).not.toBeNull();
    expect(ecart! * 100).toBeCloseTo(3.62, 2);
  });

  it('past 1 %, both numbers are shown with their origin', () => {
    expect(totalDivergeSuffisamment(13_300, 13_800)).toBe(true);
  });

  it('under 1 %, saying nothing is the right amount of noise', () => {
    // 50 / 13 800 = 0,36 %
    expect(totalDivergeSuffisamment(13_750, 13_800)).toBe(false);
  });

  it('an absent or nonsensical remembered total is simply not confronted', () => {
    expect(ecartRelatif(0, 13_800)).toBeNull();
    expect(totalDivergeSuffisamment(0, 13_800)).toBe(false);
  });
});
