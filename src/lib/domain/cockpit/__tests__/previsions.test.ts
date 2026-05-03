import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

import { genererPrevisions } from '@/lib/domain/cockpit/previsions';
import type { CockpitCharge, ReferencePeriod } from '@/lib/domain/cockpit/types';

const charge = (over: Partial<CockpitCharge>): CockpitCharge => ({
  id: over.id ?? 'c-' + Math.random().toString(36).slice(2),
  label: over.label ?? 'Test',
  amount: over.amount ?? new Decimal(0),
  frequency: over.frequency ?? 'monthly',
  paymentMonths: over.paymentMonths ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  paymentDay: over.paymentDay ?? 1,
  isActive: over.isActive ?? true,
});

const ref = (year: number, month: number): ReferencePeriod => ({ year, month });

describe('genererPrevisions', () => {
  it('returns 6 entries by default', () => {
    const out = genererPrevisions({
      charges: [],
      ref: ref(2026, 5),
      revenus: new Decimal(2000),
      plafondQuotidien: new Decimal(500),
    });
    expect(out).toHaveLength(6);
  });

  it('starts at the reference month', () => {
    const out = genererPrevisions({
      charges: [],
      ref: ref(2026, 5),
      revenus: new Decimal(2000),
      plafondQuotidien: new Decimal(500),
    });
    expect(out[0]).toMatchObject({ year: 2026, month: 5 });
    expect(out[1]).toMatchObject({ year: 2026, month: 6 });
    expect(out[5]).toMatchObject({ year: 2026, month: 10 });
  });

  it('wraps year correctly when crossing December → January', () => {
    const out = genererPrevisions({
      charges: [],
      ref: ref(2026, 10),
      revenus: new Decimal(2000),
      plafondQuotidien: new Decimal(500),
    });
    expect(out[0]).toMatchObject({ year: 2026, month: 10 });
    expect(out[2]).toMatchObject({ year: 2026, month: 12 });
    expect(out[3]).toMatchObject({ year: 2027, month: 1 });
    expect(out[5]).toMatchObject({ year: 2027, month: 3 });
  });

  it('sums charges due in each projected month', () => {
    const charges = [
      charge({ amount: new Decimal(900), frequency: 'monthly' }),
      charge({ amount: new Decimal(300), frequency: 'annual', paymentMonths: [6] }),
    ];
    const out = genererPrevisions({
      charges,
      ref: ref(2026, 5),
      revenus: new Decimal(2000),
      plafondQuotidien: new Decimal(500),
    });
    // May: 900 (monthly) → 900
    // June: 900 + 300 → 1200
    expect(out[0]!.totalCharges.toNumber()).toBe(900);
    expect(out[1]!.totalCharges.toNumber()).toBe(1200);
  });

  it('marges = revenus - charges - plafond', () => {
    const out = genererPrevisions({
      charges: [charge({ amount: new Decimal(900), frequency: 'monthly' })],
      ref: ref(2026, 5),
      revenus: new Decimal(2000),
      plafondQuotidien: new Decimal(500),
    });
    // 2000 - 900 - 500 = 600
    expect(out[0]!.margePrevue.toNumber()).toBe(600);
  });

  it('produces negative marge when charges + plafond exceed revenus', () => {
    const out = genererPrevisions({
      charges: [charge({ amount: new Decimal(2000), frequency: 'monthly' })],
      ref: ref(2026, 5),
      revenus: new Decimal(2000),
      plafondQuotidien: new Decimal(500),
    });
    expect(out[0]!.margePrevue.toNumber()).toBe(-500);
  });

  it('honors a custom horizon', () => {
    const out = genererPrevisions({
      charges: [],
      ref: ref(2026, 5),
      revenus: new Decimal(2000),
      plafondQuotidien: new Decimal(0),
      horizonMonths: 12,
    });
    expect(out).toHaveLength(12);
    expect(out[11]).toMatchObject({ year: 2027, month: 4 });
  });

  it('throws RangeError when horizon < 1', () => {
    expect(() =>
      genererPrevisions({
        charges: [],
        ref: ref(2026, 5),
        revenus: new Decimal(2000),
        plafondQuotidien: new Decimal(0),
        horizonMonths: 0,
      }),
    ).toThrow(RangeError);
  });

  it('ignores inactive charges', () => {
    const out = genererPrevisions({
      charges: [charge({ amount: new Decimal(900), frequency: 'monthly', isActive: false })],
      ref: ref(2026, 5),
      revenus: new Decimal(2000),
      plafondQuotidien: new Decimal(0),
    });
    expect(out[0]!.totalCharges.toNumber()).toBe(0);
  });
});
