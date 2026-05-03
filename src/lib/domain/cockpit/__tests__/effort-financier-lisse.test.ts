import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

import {
  effortFinancierLisse,
  provisionsMensuellesLissees,
  totalChargesMensuelles,
} from '@/lib/domain/cockpit/effort-financier-lisse';
import type { CockpitCharge } from '@/lib/domain/cockpit/types';

const charge = (over: Partial<CockpitCharge>): CockpitCharge => ({
  id: over.id ?? 'c-' + Math.random().toString(36).slice(2),
  label: 'Test',
  amount: new Decimal(0),
  frequency: 'monthly',
  paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  paymentDay: 1,
  isActive: true,
  ...over,
});

describe('totalChargesMensuelles', () => {
  it('returns 0 when there are no charges', () => {
    expect(totalChargesMensuelles([]).toNumber()).toBe(0);
  });

  it('sums only monthly charges', () => {
    const charges: CockpitCharge[] = [
      charge({ amount: new Decimal(900), frequency: 'monthly' }),
      charge({ amount: new Decimal(60), frequency: 'monthly' }),
      charge({ amount: new Decimal(300), frequency: 'annual', paymentMonths: [3] }),
      charge({ amount: new Decimal(45), frequency: 'quarterly', paymentMonths: [1, 4, 7, 10] }),
    ];
    expect(totalChargesMensuelles(charges).toNumber()).toBe(960);
  });

  it('ignores inactive monthly charges', () => {
    const charges = [
      charge({ amount: new Decimal(800), frequency: 'monthly', isActive: false }),
      charge({ amount: new Decimal(150), frequency: 'monthly' }),
    ];
    expect(totalChargesMensuelles(charges).toNumber()).toBe(150);
  });
});

describe('provisionsMensuellesLissees', () => {
  it('returns 0 when there are no charges', () => {
    expect(provisionsMensuellesLissees([]).toNumber()).toBe(0);
  });

  it('skips monthly charges entirely', () => {
    const charges = [charge({ amount: new Decimal(1000), frequency: 'monthly' })];
    expect(provisionsMensuellesLissees(charges).toNumber()).toBe(0);
  });

  it('divides annual charges by 12', () => {
    const charges = [
      charge({ amount: new Decimal(1200), frequency: 'annual', paymentMonths: [3] }),
    ];
    expect(provisionsMensuellesLissees(charges).toNumber()).toBe(100);
  });

  it('divides semiannual charges by 6', () => {
    const charges = [
      charge({ amount: new Decimal(600), frequency: 'semiannual', paymentMonths: [3, 9] }),
    ];
    expect(provisionsMensuellesLissees(charges).toNumber()).toBe(100);
  });

  it('divides quarterly charges by 3', () => {
    const charges = [
      charge({ amount: new Decimal(45), frequency: 'quarterly', paymentMonths: [1, 4, 7, 10] }),
    ];
    expect(provisionsMensuellesLissees(charges).toNumber()).toBe(15);
  });

  it("matches @thierry's real Dashlane fixture", () => {
    const charges = [
      charge({ id: 'dashlane', amount: new Decimal(53), frequency: 'annual', paymentMonths: [4] }),
      charge({
        id: 'swde',
        amount: new Decimal(45),
        frequency: 'quarterly',
        paymentMonths: [1, 4, 7, 10],
      }),
      charge({
        id: 'taxe-voiture',
        amount: new Decimal(300),
        frequency: 'annual',
        paymentMonths: [6],
      }),
      charge({
        id: 'taxe-poubelle',
        amount: new Decimal(120),
        frequency: 'annual',
        paymentMonths: [3],
      }),
      charge({
        id: 'taxe-egout',
        amount: new Decimal(55),
        frequency: 'annual',
        paymentMonths: [3],
      }),
    ];
    // 53/12 + 45/3 + 300/12 + 120/12 + 55/12 = 4.4166… + 15 + 25 + 10 + 4.5833… = 59
    expect(provisionsMensuellesLissees(charges).toFixed(2)).toBe('59.00');
  });

  it('ignores inactive periodic charges', () => {
    const charges = [
      charge({
        amount: new Decimal(1200),
        frequency: 'annual',
        paymentMonths: [3],
        isActive: false,
      }),
    ];
    expect(provisionsMensuellesLissees(charges).toNumber()).toBe(0);
  });
});

describe('effortFinancierLisse', () => {
  it('is the sum of monthly + provisions', () => {
    const charges = [
      charge({ amount: new Decimal(1500), frequency: 'monthly' }),
      charge({ amount: new Decimal(1200), frequency: 'annual', paymentMonths: [3] }),
      charge({ amount: new Decimal(45), frequency: 'quarterly', paymentMonths: [1, 4, 7, 10] }),
    ];
    // 1500 + (100 + 15) = 1615
    expect(effortFinancierLisse(charges).toNumber()).toBe(1615);
  });

  it('returns 0 for an empty list', () => {
    expect(effortFinancierLisse([]).toNumber()).toBe(0);
  });

  it('keeps internal precision (no premature rounding)', () => {
    // 53 / 12 = 4.4166666… — stored as Decimal, should NOT collapse to 4.42
    const charges = [charge({ amount: new Decimal(53), frequency: 'annual', paymentMonths: [4] })];
    expect(effortFinancierLisse(charges).toFixed(6)).toBe('4.416667');
  });
});
