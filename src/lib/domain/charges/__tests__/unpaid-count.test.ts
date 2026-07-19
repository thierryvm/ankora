import { describe, it, expect } from 'vitest';

import { countUnpaidForPeriod, type UnpaidCountCharge } from '../unpaid-count';

const charge = (over: Partial<UnpaidCountCharge> = {}): UnpaidCountCharge => ({
  id: 'c1',
  paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  isActive: true,
  ...over,
});

describe('countUnpaidForPeriod', () => {
  it('counts an active charge due in the period with no paid tick', () => {
    expect(countUnpaidForPeriod([charge()], new Set(), { month: 6 })).toBe(1);
  });

  it('skips a charge that was ticked for the period', () => {
    expect(countUnpaidForPeriod([charge()], new Set(['c1']), { month: 6 })).toBe(0);
  });

  it('skips a charge not due in the period (quarterly off-month)', () => {
    expect(
      countUnpaidForPeriod([charge({ paymentMonths: [1, 4, 7, 10] })], new Set(), { month: 6 }),
    ).toBe(0);
  });

  it('skips inactive charges', () => {
    expect(countUnpaidForPeriod([charge({ isActive: false })], new Set(), { month: 6 })).toBe(0);
  });

  it('counts across a mixed set', () => {
    const charges = [
      charge({ id: 'paid' }),
      charge({ id: 'unpaid' }),
      charge({ id: 'off-month', paymentMonths: [12] }),
      charge({ id: 'inactive', isActive: false }),
    ];
    expect(countUnpaidForPeriod(charges, new Set(['paid']), { month: 6 })).toBe(1);
  });
});
