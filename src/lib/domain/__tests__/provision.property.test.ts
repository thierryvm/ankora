import { describe, it } from 'vitest';
import * as fc from 'fast-check';

import { safetyBuffer } from '../provision';
import { chargeArb } from '../../../../tests/helpers/domain-arbitraries';

/**
 * Property tests for src/lib/domain/provision.safetyBuffer — annualized
 * exposure used as a "what would 12 months of bills cost?" reference.
 * Invariants : non-negativity + commutativity + zero-exclusion of inactive
 * charges.
 *
 * Uses the shared `chargeArb` (mixed isActive) from
 * `tests/helpers/domain-arbitraries` so the inactive-charge invariants
 * are exercised on the same generator shape as other domain tests.
 *
 * Refs: ADR-006 + docs/testing-strategy.md §Phase T1.
 */

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
