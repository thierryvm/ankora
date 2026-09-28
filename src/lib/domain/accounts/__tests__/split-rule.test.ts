import { describe, expect, it } from 'vitest';

import type { MovementRecord } from '@/lib/domain/accounts/operations-view';
import { splitByRule, splitDiffersFromRule } from '@/lib/domain/accounts/split-rule';
import { money, type Charge } from '@/lib/domain/types';

/*
 * A transfer to the provisions written before `provisionPartOfMonth` (#505)
 * put the whole amount in provisions. Fictitious figures: 840 a year due in
 * January is 70 a month of provisions in September, so a 505 transfer splits
 * 70 + 435 under the rule of today.
 */
const CHARGES: Charge[] = [
  {
    id: 'c-840',
    label: 'Facture fictive',
    amount: money(840),
    frequency: 'annual',
    dueMonth: 1,
    paymentMonths: [1],
    paymentDay: 1,
    categoryId: null,
    isActive: true,
    paidFrom: 'epargne',
  },
];

const transfer = (patch: Partial<MovementRecord> = {}): MovementRecord => ({
  id: 'm-1',
  kind: 'transfer',
  fromAccountType: 'income_bills',
  toAccountType: 'provisions',
  amount: money(505),
  occurredOn: new Date('2026-09-18T00:00:00Z'),
  recordedAt: new Date('2026-09-18T08:00:00Z'),
  cancelledAt: null,
  planYear: 2026,
  planMonth: 9,
  planSuggestedAmount: money(505),
  provisionPart: money(505),
  freeSavingsPart: money(0),
  incomeNature: null,
  budgetYear: null,
  budgetMonth: null,
  description: null,
  ...patch,
});

describe('splitByRule', () => {
  it('gives the split of the domain rule for the plan month: provisions first, the rest free', () => {
    const split = splitByRule(transfer(), CHARGES);
    expect(split?.provisionPart.toString()).toBe('70');
    expect(split?.freeSavingsPart.toString()).toBe('435');
  });

  it('caps the provisions share at the amount transferred', () => {
    const split = splitByRule(transfer({ amount: money(50) }), CHARGES);
    expect(split?.provisionPart.toString()).toBe('50');
    expect(split?.freeSavingsPart.toString()).toBe('0');
  });

  it('has no split for what is not a standing plan transfer to the provisions', () => {
    for (const patch of [
      { cancelledAt: new Date('2026-09-20T10:00:00Z') },
      { toAccountType: 'daily_card' as const },
      { kind: 'income' as const, fromAccountType: null },
      { planMonth: null },
      { planYear: null },
    ]) {
      expect(splitByRule(transfer(patch), CHARGES)).toBeNull();
    }
  });
});

describe('splitDiffersFromRule', () => {
  it('is true for the old split (the whole amount in provisions)', () => {
    expect(splitDiffersFromRule(transfer(), CHARGES)).toBe(true);
  });

  it('is false once the split equals the rule — at the cent, whatever the Decimal scale', () => {
    expect(
      splitDiffersFromRule(
        transfer({ provisionPart: money('70.00'), freeSavingsPart: money('435.00') }),
        CHARGES,
      ),
    ).toBe(false);
  });

  it('is true when only the free share disagrees, and when a part is missing', () => {
    expect(
      splitDiffersFromRule(
        transfer({ provisionPart: money(70), freeSavingsPart: money(430) }),
        CHARGES,
      ),
    ).toBe(true);
    expect(
      splitDiffersFromRule(transfer({ provisionPart: null, freeSavingsPart: null }), CHARGES),
    ).toBe(true);
  });

  it('is false where the rule does not apply: cancelled, elsewhere, an income, outside a plan', () => {
    for (const patch of [
      { cancelledAt: new Date('2026-09-20T10:00:00Z') },
      { toAccountType: 'daily_card' as const, provisionPart: null, freeSavingsPart: null },
      { kind: 'income' as const, fromAccountType: null },
      { planMonth: null },
    ]) {
      expect(splitDiffersFromRule(transfer(patch), CHARGES)).toBe(false);
    }
  });
});
