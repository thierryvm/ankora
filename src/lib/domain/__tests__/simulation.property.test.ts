import { describe, it } from 'vitest';
import * as fc from 'fast-check';

import { projectCumulative } from '../simulation';
import { money } from '../types';

/**
 * Property tests for src/lib/domain/simulation.projectCumulative — the
 * arithmetic backbone of the dashboard "Timeline 6 mois prédictive".
 * Linearity guarantees that the dashboard projection is a function of
 * (delta, months) only — no hidden state, no rounding drift.
 *
 * Refs: ADR-006 + docs/testing-strategy.md §Phase T1.
 */

const moneyArb = fc
  .double({ min: -100_000, max: 100_000, noNaN: true, noDefaultInfinity: true })
  .map((n) => money(n.toFixed(2)));

const monthsArb = fc.integer({ min: 0, max: 120 });

describe('projectCumulative — properties', () => {
  it('returns zero whenever months === 0', () => {
    fc.assert(
      fc.property(moneyArb, (delta) => {
        return projectCumulative(delta, 0).isZero();
      }),
    );
  });

  it('returns zero whenever the monthly delta is zero', () => {
    fc.assert(
      fc.property(monthsArb, (months) => {
        return projectCumulative(money(0), months).isZero();
      }),
    );
  });

  it('throws RangeError on negative months', () => {
    fc.assert(
      fc.property(moneyArb, fc.integer({ min: -120, max: -1 }), (delta, months) => {
        try {
          projectCumulative(delta, months);
          return false;
        } catch (error) {
          return error instanceof RangeError;
        }
      }),
    );
  });

  it('is linear in months: project(d, m) = d × m (for d ≠ 0, m > 0)', () => {
    const nonZeroDelta = moneyArb.filter((m) => !m.isZero());
    const positiveMonths = fc.integer({ min: 1, max: 120 });

    fc.assert(
      fc.property(nonZeroDelta, positiveMonths, (delta, months) => {
        return projectCumulative(delta, months).eq(delta.times(months));
      }),
    );
  });

  it('is additive in months: project(d, a + b) = project(d, a) + project(d, b)', () => {
    const nonZeroDelta = moneyArb.filter((m) => !m.isZero());

    fc.assert(
      fc.property(
        nonZeroDelta,
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: 1, max: 60 }),
        (delta, a, b) => {
          const combined = projectCumulative(delta, a + b);
          const split = projectCumulative(delta, a).plus(projectCumulative(delta, b));
          return combined.eq(split);
        },
      ),
    );
  });
});
