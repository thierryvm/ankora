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
 * @thierry lost the Alpha Credit contract: no rate, no original capital, no
 * original term. He knows 250 €/month. A form that demands the rate is a form
 * that gets abandoned — so the conversion is designed on this case, and the
 * three doors below are the only questions it may ask.
 *
 * The reference dataset, and the number every door must land on:
 *   Alpha Credit · 250 €/mois · 1ʳᵉ échéance 15/07/2024 · 60 mensualités
 *   fin 15/06/2029 · **35 échéances restantes = 8 750 €**
 */

/** Anchor = the NEXT instalment, August 2026 (locked decision D3). */
const OPTS: DeriverHorizonOptions = {
  anchor: { year: 2026, month: 8 },
  installmentAmount: 250,
  frequency: 'monthly',
};

const PORTE_DATE: PorteHorizon = { kind: 'dateDeFin', year: 2029, month: 6 };
const PORTE_COUNT: PorteHorizon = { kind: 'echeancesRestantes', count: 35 };
const PORTE_SOLDE: PorteHorizon = { kind: 'soldeRestantDu', balance: 8750 };

describe('the three doors, on the real Alpha Credit', () => {
  it('date de fin juin 2029 → 35 échéances', () => {
    expect(deriverInstallmentsTotal(PORTE_DATE, OPTS)).toBe(35);
  });

  it('35 échéances restantes → 35 (no derivation at all)', () => {
    expect(deriverInstallmentsTotal(PORTE_COUNT, OPTS)).toBe(35);
  });

  it('solde restant dû 8 750 € → 35 (the door that survives a lost contract)', () => {
    expect(deriverInstallmentsTotal(PORTE_SOLDE, OPTS)).toBe(35);
  });

  it('the round trip closes: 35 instalments from August 2026 end in June 2029', () => {
    const c: Commitment = {
      id: 'alpha',
      kind: 'debt',
      totalAmount: 35 * 250,
      installmentAmount: 250,
      installmentsTotal: 35,
      startYear: 2026,
      startMonth: 8,
      paymentDay: 15,
      frequency: 'monthly',
      isActive: true,
    };
    expect(endPeriod(c)).toEqual({ year: 2029, month: 6 });
    expect(c.totalAmount).toBe(8750);
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
    expect(deriverInstallmentsTotal({ kind: 'soldeRestantDu', balance: 40 }, OPTS)).toBeNull();
  });

  it('an end date IN the anchor month is one instalment, not zero', () => {
    expect(deriverInstallmentsTotal({ kind: 'dateDeFin', year: 2026, month: 8 }, OPTS)).toBe(1);
  });

  it('a quarterly cadence counts cycles, not months', () => {
    expect(
      deriverInstallmentsTotal(
        { kind: 'dateDeFin', year: 2027, month: 8 },
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
    const out = confronterPortes([PORTE_COUNT, { kind: 'soldeRestantDu', balance: 8000 }], OPTS);
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
  it("@thierry's 14 500 € against the schedule's 15 000 € is a 3,3 % gap", () => {
    const ecart = ecartRelatif(14_500, 60 * 250);
    expect(ecart).not.toBeNull();
    expect(ecart! * 100).toBeCloseTo(3.33, 2);
  });

  it('past 1 %, both numbers are shown with their origin', () => {
    expect(totalDivergeSuffisamment(14_500, 15_000)).toBe(true);
  });

  it('under 1 %, saying nothing is the right amount of noise', () => {
    expect(totalDivergeSuffisamment(14_950, 15_000)).toBe(false);
  });

  it('an absent or nonsensical remembered total is simply not confronted', () => {
    expect(ecartRelatif(0, 15_000)).toBeNull();
    expect(totalDivergeSuffisamment(0, 15_000)).toBe(false);
  });
});
