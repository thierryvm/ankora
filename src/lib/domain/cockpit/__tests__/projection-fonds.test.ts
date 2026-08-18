import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';

import { premierMoisEnDeficit, projeterFondsProvision } from '../projection-fonds';
import type { CockpitCharge, ReferencePeriod } from '../types';

/**
 * « Est-ce que mon fonds tient jusqu'à la prochaine grosse facture ? »
 *
 * The gauge answers « à jour » TODAY. It cannot say that the fund goes negative
 * in March. This is the accumulator that can — `solde = solde + lissé − sortie`,
 * iterated — and these cases are what make it a prediction rather than a
 * promise.
 */

const REF: ReferencePeriod = { year: 2026, month: 1 };

const charge = (over: Partial<CockpitCharge> = {}): CockpitCharge => ({
  id: 'c',
  label: 'Charge',
  amount: new Decimal(1200),
  frequency: 'annual',
  paymentMonths: [3],
  paymentDay: 10,
  isActive: true,
  ...over,
});

describe('the accumulator', () => {
  it('projects 12 months by default', () => {
    expect(
      projeterFondsProvision({ charges: [charge()], soldeInitial: new Decimal(0), ref: REF }),
    ).toHaveLength(12);
  });

  it('feeds the fund every month and draws it on the bill month', () => {
    // 1 200 €/an → 100 €/mois lissés, one 1 200 € outflow in March.
    const p = projeterFondsProvision({
      charges: [charge()],
      soldeInitial: new Decimal(0),
      ref: REF,
    });
    expect(p[0]).toMatchObject({ year: 2026, month: 1 });
    expect(p[0]?.lisse.toNumber()).toBe(100);
    expect(p[0]?.sortie.toNumber()).toBe(0);
    expect(p[0]?.solde.toNumber()).toBe(100);
    expect(p[1]?.solde.toNumber()).toBe(200);
    // March: +100 smoothed, −1 200 bill → 300 − 1 200 = −900.
    expect(p[2]?.sortie.toNumber()).toBe(1200);
    expect(p[2]?.ecart.toNumber()).toBe(-1100);
    expect(p[2]?.solde.toNumber()).toBe(-900);
    // Then it climbs back at 100 €/month.
    expect(p[3]?.solde.toNumber()).toBe(-800);
  });

  it('a fund that started full never breaks — that is the whole point of provisioning', () => {
    const p = projeterFondsProvision({
      charges: [charge()],
      soldeInitial: new Decimal(1100),
      ref: REF,
    });
    expect(p.every((m) => m.solde.gte(0))).toBe(true);
    expect(premierMoisEnDeficit(p)).toBeNull();
  });

  it('names the first month the fund goes under — the sentence the screen leads with', () => {
    const p = projeterFondsProvision({
      charges: [charge()],
      soldeInitial: new Decimal(0),
      ref: REF,
    });
    expect(premierMoisEnDeficit(p)).toMatchObject({ year: 2026, month: 3 });
  });

  it('wraps the year: a 12-month horizon from July ends in June', () => {
    const p = projeterFondsProvision({
      charges: [charge()],
      soldeInitial: new Decimal(0),
      ref: { year: 2026, month: 7 },
    });
    expect(p[0]).toMatchObject({ year: 2026, month: 7 });
    expect(p[11]).toMatchObject({ year: 2027, month: 6 });
  });
});

describe('what the fund does and does not hold', () => {
  it('monthly charges never transit through it — neither as inflow nor as outflow', () => {
    const p = projeterFondsProvision({
      charges: [
        charge({ id: 'loyer', frequency: 'monthly', amount: new Decimal(900), paymentMonths: [1] }),
      ],
      soldeInitial: new Decimal(0),
      ref: REF,
    });
    expect(p.every((m) => m.lisse.isZero() && m.sortie.isZero())).toBe(true);
  });

  it('an inactive charge is invisible on both sides', () => {
    const p = projeterFondsProvision({
      charges: [charge({ isActive: false })],
      soldeInitial: new Decimal(500),
      ref: REF,
    });
    expect(p.every((m) => m.solde.toNumber() === 500)).toBe(true);
  });

  it('several cadences accumulate — quarterly and annual share one fund', () => {
    const p = projeterFondsProvision({
      charges: [
        charge({ id: 'annuel', amount: new Decimal(1200), paymentMonths: [3] }),
        charge({
          id: 'trim',
          frequency: 'quarterly',
          amount: new Decimal(177),
          paymentMonths: [1, 4, 7, 10],
        }),
      ],
      soldeInitial: new Decimal(0),
      ref: REF,
    });
    // 100 (annuel) + 59 (177/3) = 159 €/mois.
    expect(p[0]?.lisse.toNumber()).toBe(159);
    // January carries the 177 € quarterly bill: 159 − 177 = −18.
    expect(p[0]?.solde.toNumber()).toBe(-18);
  });
});
