import { describe, it } from 'vitest';
import * as fc from 'fast-check';

import { dailyAllowance, remainingBudget, summarizeExpenses } from '../balance';
import { money, type Expense } from '../types';

/**
 * Property-based tests for src/lib/domain/balance.
 *
 * These complement the example-based tests in balance.test.ts by asserting
 * mathematical invariants over 1000 random inputs (default fast-check runs)
 * — commutativity, identity, conservation, monotonicity. Mutations that
 * preserve a single example may be silently shipped; properties don't.
 *
 * Money is decimal.js so we use `.eq()` / `.cmp()` instead of `===`.
 *
 * Refs: ADR-006 + docs/testing-strategy.md §Phase T1.
 */

const moneyArb = fc
  .double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true })
  .map((n) => money(n.toFixed(2))); // 2-decimal cents to match real currency input

const expenseArb: fc.Arbitrary<Expense> = fc.record({
  id: fc.uuid(),
  label: fc.string({ minLength: 1, maxLength: 30 }),
  amount: moneyArb,
  occurredOn: fc.constant('2026-01-15'),
  categoryId: fc.option(fc.uuid(), { nil: null }),
  note: fc.option(fc.string({ maxLength: 50 }), { nil: null }),
  paidFrom: fc.constantFrom('principal', 'vie_courante', 'epargne'),
});

describe('summarizeExpenses — properties', () => {
  it('totalSpent is commutative under list reordering', () => {
    fc.assert(
      fc.property(fc.array(expenseArb, { maxLength: 25 }), (expenses) => {
        const reversed = [...expenses].reverse();
        return summarizeExpenses(expenses).totalSpent.eq(summarizeExpenses(reversed).totalSpent);
      }),
    );
  });

  it('empty list summarizes to zero', () => {
    fc.assert(
      fc.property(fc.constant([]), (expenses) => {
        const result = summarizeExpenses(expenses);
        return result.totalSpent.isZero() && result.count === 0 && result.byCategoryId.size === 0;
      }),
    );
  });

  it('totalSpent equals the sum of byCategoryId values (conservation)', () => {
    fc.assert(
      fc.property(fc.array(expenseArb, { maxLength: 25 }), (expenses) => {
        const result = summarizeExpenses(expenses);
        const categorySum = [...result.byCategoryId.values()].reduce(
          (acc, value) => acc.plus(value),
          money(0),
        );
        return result.totalSpent.eq(categorySum);
      }),
    );
  });

  it('count equals expenses.length', () => {
    fc.assert(
      fc.property(fc.array(expenseArb, { maxLength: 25 }), (expenses) => {
        return summarizeExpenses(expenses).count === expenses.length;
      }),
    );
  });
});

describe('remainingBudget — properties', () => {
  it('is consistent: income − chargesDue − variableSpent', () => {
    fc.assert(
      fc.property(moneyArb, moneyArb, moneyArb, (income, chargesDue, variableSpent) => {
        const expected = income.minus(chargesDue).minus(variableSpent);
        return remainingBudget(income, chargesDue, variableSpent).eq(expected);
      }),
    );
  });

  // The function rejects negativity on each of the three operands. We split
  // into three focused properties (one per operand) so a regression on any
  // single guard is attributed clearly in the test report — instead of a
  // single broad property that could obscure which guard regressed.

  const negativeMoneyArb = fc
    .double({ min: -1_000_000, max: -0.01, noNaN: true, noDefaultInfinity: true })
    .map((n) => money(n.toFixed(2)));

  it('throws RangeError when income is negative', () => {
    fc.assert(
      fc.property(negativeMoneyArb, moneyArb, moneyArb, (income, chargesDue, variableSpent) => {
        try {
          remainingBudget(income, chargesDue, variableSpent);
          return false;
        } catch (error) {
          return error instanceof RangeError;
        }
      }),
    );
  });

  it('throws RangeError when chargesDue is negative', () => {
    fc.assert(
      fc.property(moneyArb, negativeMoneyArb, moneyArb, (income, chargesDue, variableSpent) => {
        try {
          remainingBudget(income, chargesDue, variableSpent);
          return false;
        } catch (error) {
          return error instanceof RangeError;
        }
      }),
    );
  });

  it('throws RangeError when variableSpent is negative', () => {
    fc.assert(
      fc.property(moneyArb, moneyArb, negativeMoneyArb, (income, chargesDue, variableSpent) => {
        try {
          remainingBudget(income, chargesDue, variableSpent);
          return false;
        } catch (error) {
          return error instanceof RangeError;
        }
      }),
    );
  });
});

describe('dailyAllowance — properties', () => {
  it('returns zero whenever daysLeft <= 0', () => {
    fc.assert(
      fc.property(moneyArb, fc.integer({ min: -100, max: 0 }), (remaining, daysLeft) => {
        return dailyAllowance(remaining, daysLeft).isZero();
      }),
    );
  });

  it('returns zero whenever remaining <= 0', () => {
    const nonPositiveMoney = fc
      .double({ min: -1_000_000, max: 0, noNaN: true, noDefaultInfinity: true })
      .map((n) => money(n.toFixed(2)));

    fc.assert(
      fc.property(nonPositiveMoney, fc.integer({ min: 1, max: 31 }), (remaining, daysLeft) => {
        return dailyAllowance(remaining, daysLeft).isZero();
      }),
    );
  });

  it('dailyAllowance × daysLeft ≈ remaining (within 1 cent — Decimal precision tolerance)', () => {
    // Note: `remaining / daysLeft × daysLeft` does not always round-trip exactly
    // when `daysLeft` is not a divisor of `remaining` (e.g. 0.01 / 7 produces a
    // repeating decimal). The UI rounds to 2 decimals before display, so a
    // < 1 cent drift on the raw Decimal is acceptable — and is the actual
    // contract callers rely on. Strict equality would require restricting
    // arbitraries to amounts divisible by daysLeft, which would test less.
    const positiveMoney = fc
      .double({ min: 0.01, max: 1_000_000, noNaN: true, noDefaultInfinity: true })
      .map((n) => money(n.toFixed(2)));

    fc.assert(
      fc.property(positiveMoney, fc.integer({ min: 1, max: 31 }), (remaining, daysLeft) => {
        const allowance = dailyAllowance(remaining, daysLeft);
        const reconstructed = allowance.times(daysLeft);
        const drift = reconstructed.minus(remaining).abs();
        return drift.lte(money('0.01'));
      }),
    );
  });
});
