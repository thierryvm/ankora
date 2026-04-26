import * as fc from 'fast-check';

import { money, type Charge, type ChargeFrequency } from '@/lib/domain/types';

/**
 * Shared fast-check arbitraries for `src/lib/domain/` types.
 *
 * Reused by `*.property.test.ts` files in the domain test suite so the
 * generators stay consistent — if a new field is added to `Charge` (e.g.
 * `endDate`, `currency`), updating the helper propagates the change to
 * every property test in one place.
 *
 * Refs: ADR-006 §Phase T1 + docs/testing-strategy.md.
 */

export const chargeFrequencyArb: fc.Arbitrary<ChargeFrequency> = fc.constantFrom(
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
);

/**
 * Realistic Charge generator covering all four frequencies, every month
 * 1..12, both `paidFrom` accounts, and amounts spanning typical European
 * household bills (0.01 € → 100k €).
 *
 * Pass `isActive: fc.constant(true)` (or other override) via `fc.record`
 * spread if a test needs a specific subset.
 */
export const chargeArb: fc.Arbitrary<Charge> = fc.record({
  id: fc.uuid(),
  label: fc.string({ minLength: 1, maxLength: 30 }),
  amount: fc
    .double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true })
    .map((n) => money(n.toFixed(2))),
  frequency: chargeFrequencyArb,
  dueMonth: fc.integer({ min: 1, max: 12 }),
  categoryId: fc.option(fc.uuid(), { nil: null }),
  isActive: fc.boolean(),
  paidFrom: fc.constantFrom('principal', 'epargne'),
});

/**
 * Variant that always returns active charges. Used by tests that assert
 * invariants conditional on `isActive === true` (e.g. monthly provision
 * arithmetic, annual total).
 */
export const activeChargeArb: fc.Arbitrary<Charge> = fc.record({
  id: fc.uuid(),
  label: fc.string({ minLength: 1, maxLength: 30 }),
  amount: fc
    .double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true })
    .map((n) => money(n.toFixed(2))),
  frequency: chargeFrequencyArb,
  dueMonth: fc.integer({ min: 1, max: 12 }),
  categoryId: fc.option(fc.uuid(), { nil: null }),
  isActive: fc.constant(true),
  paidFrom: fc.constantFrom('principal', 'epargne'),
});
