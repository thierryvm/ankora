import { describe, it } from 'vitest';
import * as fc from 'fast-check';

import { safetyBuffer } from '../provision';
import { money, type Charge, type ChargeFrequency } from '../types';

/**
 * Property tests for src/lib/domain/provision.safetyBuffer — annualized
 * exposure used as a "what would 12 months of bills cost?" reference.
 * Invariants : non-negativity + commutativity + zero-exclusion of inactive
 * charges.
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
  isActive: fc.boolean(),
  paidFrom: fc.constantFrom('principal', 'epargne'),
}) as fc.Arbitrary<Charge>;

describe('safetyBuffer — properties', () => {
  it('is non-negative for any input', () => {
    fc.assert(
      fc.property(fc.array(chargeArb, { maxLength: 25 }), (charges) => {
        return safetyBuffer(charges).gte(0);
      }),
    );
  });

  it('is zero when all charges are inactive', () => {
    fc.assert(
      fc.property(fc.array(chargeArb, { maxLength: 10 }), (charges) => {
        const allInactive = charges.map((c) => ({ ...c, isActive: false }));
        return safetyBuffer(allInactive).isZero();
      }),
    );
  });

  it('is commutative under list reordering', () => {
    fc.assert(
      fc.property(fc.array(chargeArb, { maxLength: 25 }), (charges) => {
        const reversed = [...charges].reverse();
        return safetyBuffer(charges).eq(safetyBuffer(reversed));
      }),
    );
  });

  it('inactive charges contribute zero (active subset gives the same result)', () => {
    fc.assert(
      fc.property(fc.array(chargeArb, { maxLength: 15 }), (charges) => {
        const activesOnly = charges.filter((c) => c.isActive);
        return safetyBuffer(charges).eq(safetyBuffer(activesOnly));
      }),
    );
  });
});
