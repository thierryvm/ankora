import { describe, it } from 'vitest';
import * as fc from 'fast-check';

import {
  FREQUENCY_DIVISOR,
  annualTotal,
  billsDueInMonth,
  monthlyProvisionFor,
  monthlyProvisionTotal,
} from '../budget';
import { money, type Charge, type ChargeFrequency } from '../types';

/**
 * Property tests for src/lib/domain/budget — the smoothing math that turns
 * one-off bills (annual taxes, semi-annual insurance) into a steady
 * monthly provision. Invariants here are load-bearing for the entire
 * "Budget de lissage" concept.
 *
 * Refs: ADR-006 + docs/testing-strategy.md §Phase T1.
 */

const frequencyArb: fc.Arbitrary<ChargeFrequency> = fc.constantFrom(
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
);

const chargeArb = fc.record({
  id: fc.uuid(),
  label: fc.string({ minLength: 1, maxLength: 30 }),
  amount: fc
    .double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true })
    .map((n) => money(n.toFixed(2))),
  frequency: frequencyArb,
  dueMonth: fc.integer({ min: 1, max: 12 }),
  categoryId: fc.option(fc.uuid(), { nil: null }),
  isActive: fc.constant(true),
  paidFrom: fc.constantFrom('principal', 'epargne'),
}) as fc.Arbitrary<Charge>;

describe('monthlyProvisionFor — properties', () => {
  it('is zero for an inactive charge', () => {
    fc.assert(
      fc.property(chargeArb, (charge) => {
        const inactive = { ...charge, isActive: false };
        return monthlyProvisionFor(inactive).isZero();
      }),
    );
  });

  it('monthly × FREQUENCY_DIVISOR ≈ original amount (within 1 cent — Decimal tolerance)', () => {
    // Note: amount / divisor produces a repeating decimal when divisor doesn't
    // divide the amount cleanly (e.g. 0.01 / 3 = 0.003333...). Decimal.js
    // rounds at 20-digit precision so the round-trip drifts by sub-cent
    // amounts. UI displays 2 decimals → drift invisible to users. Asserting
    // strict equality would require restricting arbitraries to amounts
    // divisible by 12 (the LCM of 1, 3, 6, 12) which would test less.
    fc.assert(
      fc.property(chargeArb, (charge) => {
        const monthly = monthlyProvisionFor(charge);
        const reconstructed = monthly.times(FREQUENCY_DIVISOR[charge.frequency]);
        const drift = reconstructed.minus(charge.amount).abs();
        return drift.lte(money('0.01'));
      }),
    );
  });

  it('result is non-negative when the charge amount is non-negative', () => {
    fc.assert(
      fc.property(chargeArb, (charge) => {
        return monthlyProvisionFor(charge).gte(0);
      }),
    );
  });
});

describe('monthlyProvisionTotal — properties', () => {
  it('is commutative under list reordering (within 1 cent — Decimal tolerance)', () => {
    // Same Decimal precision caveat as monthlyProvisionFor: with sub-cent
    // repeating decimals from /3, /6, /12, summation order can affect the
    // last digit. Tolerance of 1 cent matches the UI rounding contract.
    fc.assert(
      fc.property(fc.array(chargeArb, { maxLength: 20 }), (charges) => {
        const reversed = [...charges].reverse();
        const drift = monthlyProvisionTotal(charges).minus(monthlyProvisionTotal(reversed)).abs();
        return drift.lte(money('0.01'));
      }),
    );
  });

  it('is additive: total([a, b, c]) ≈ total([a]) + total([b]) + total([c]) (within 1 cent)', () => {
    fc.assert(
      fc.property(fc.array(chargeArb, { minLength: 1, maxLength: 10 }), (charges) => {
        const grouped = monthlyProvisionTotal(charges);
        const sumOfIndividuals = charges.reduce(
          (acc, charge) => acc.plus(monthlyProvisionTotal([charge])),
          money(0),
        );
        const drift = grouped.minus(sumOfIndividuals).abs();
        return drift.lte(money('0.01'));
      }),
    );
  });

  it('empty list yields zero', () => {
    fc.assert(
      fc.property(fc.constant([]), (charges) => {
        return monthlyProvisionTotal(charges).isZero();
      }),
    );
  });
});

describe('billsDueInMonth — properties', () => {
  it('throws RangeError outside the 1..12 month range', () => {
    fc.assert(
      fc.property(
        fc.array(chargeArb, { maxLength: 5 }),
        fc.oneof(fc.integer({ max: 0 }), fc.integer({ min: 13 })),
        (charges, month) => {
          try {
            billsDueInMonth(charges, month);
            return false;
          } catch (error) {
            return error instanceof RangeError;
          }
        },
      ),
    );
  });

  it('result is non-negative for any valid month', () => {
    fc.assert(
      fc.property(
        fc.array(chargeArb, { maxLength: 20 }),
        fc.integer({ min: 1, max: 12 }),
        (charges, month) => {
          return billsDueInMonth(charges, month).gte(0);
        },
      ),
    );
  });
});

describe('annualTotal — properties', () => {
  it('is commutative under list reordering', () => {
    fc.assert(
      fc.property(fc.array(chargeArb, { maxLength: 20 }), (charges) => {
        const reversed = [...charges].reverse();
        return annualTotal(charges).eq(annualTotal(reversed));
      }),
    );
  });
});
