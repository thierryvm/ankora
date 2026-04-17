import { describe, it, expect } from 'vitest';
import { money } from '@/lib/domain/types';
import {
  monthlyProvisionFor,
  monthlyProvisionTotal,
  billsDueInMonth,
  suggestedTransfer,
  annualTotal,
} from '@/lib/domain/budget';
import type { Charge } from '@/lib/domain/types';

const base = {
  categoryId: null,
  isActive: true,
  paidFrom: 'principal',
} satisfies Partial<Charge>;

const rent: Charge = {
  ...base,
  id: 'c1',
  label: 'Loyer',
  amount: money(900),
  frequency: 'monthly',
  dueMonth: 1,
};
const insurance: Charge = {
  ...base,
  id: 'c2',
  label: 'Assurance',
  amount: money(1200),
  frequency: 'annual',
  dueMonth: 3,
};
const water: Charge = {
  ...base,
  id: 'c3',
  label: 'Eau',
  amount: money(90),
  frequency: 'quarterly',
  dueMonth: 2,
};
const gym: Charge = {
  ...base,
  id: 'c4',
  label: 'Gym',
  amount: money(40),
  frequency: 'semiannual',
  dueMonth: 6,
};
const inactiveHeating: Charge = {
  ...base,
  id: 'c5',
  label: 'Ancien chauffage',
  amount: money(100),
  frequency: 'monthly',
  dueMonth: 1,
  isActive: false,
};

describe('monthlyProvisionFor', () => {
  it('returns full amount for monthly charges', () => {
    expect(monthlyProvisionFor(rent).toNumber()).toBe(900);
  });
  it('divides annual charges by 12', () => {
    expect(monthlyProvisionFor(insurance).toNumber()).toBe(100);
  });
  it('divides quarterly charges by 3', () => {
    expect(monthlyProvisionFor(water).toNumber()).toBe(30);
  });
  it('divides semiannual charges by 6', () => {
    expect(monthlyProvisionFor(gym).toNumber()).toBeCloseTo(6.666666, 5);
  });
  it('returns zero for inactive charges', () => {
    expect(monthlyProvisionFor(inactiveHeating).toNumber()).toBe(0);
  });
});

describe('monthlyProvisionTotal', () => {
  it('sums provisions across charges', () => {
    const total = monthlyProvisionTotal([rent, insurance, water]);
    expect(total.toNumber()).toBe(1030);
  });
  it('skips inactive charges', () => {
    const total = monthlyProvisionTotal([rent, inactiveHeating]);
    expect(total.toNumber()).toBe(900);
  });
  it('returns zero for empty list', () => {
    expect(monthlyProvisionTotal([]).toNumber()).toBe(0);
  });
});

describe('billsDueInMonth', () => {
  const charges = [rent, insurance, water];

  it('always includes monthly charges', () => {
    for (let m = 1; m <= 12; m++) {
      expect(billsDueInMonth([rent], m).toNumber()).toBe(900);
    }
  });
  it('includes annual charge only on its due month', () => {
    expect(billsDueInMonth([insurance], 3).toNumber()).toBe(1200);
    expect(billsDueInMonth([insurance], 4).toNumber()).toBe(0);
  });
  it('includes quarterly charge every 3 months from due month', () => {
    expect(billsDueInMonth([water], 2).toNumber()).toBe(90);
    expect(billsDueInMonth([water], 5).toNumber()).toBe(90);
    expect(billsDueInMonth([water], 8).toNumber()).toBe(90);
    expect(billsDueInMonth([water], 11).toNumber()).toBe(90);
    expect(billsDueInMonth([water], 3).toNumber()).toBe(0);
  });
  it('includes semiannual charge every 6 months from due month', () => {
    expect(billsDueInMonth([gym], 6).toNumber()).toBe(40);
    expect(billsDueInMonth([gym], 12).toNumber()).toBe(40);
    expect(billsDueInMonth([gym], 7).toNumber()).toBe(0);
  });
  it('combines all charges due in March (rent + insurance)', () => {
    expect(billsDueInMonth(charges, 3).toNumber()).toBe(900 + 1200);
  });
  it('throws for invalid month', () => {
    expect(() => billsDueInMonth(charges, 0)).toThrow(RangeError);
    expect(() => billsDueInMonth(charges, 13)).toThrow(RangeError);
  });
});

describe('suggestedTransfer', () => {
  it('is positive in months without big bills', () => {
    const transfer = suggestedTransfer([rent, insurance], 1);
    expect(transfer.toNumber()).toBe(900 + 100 - 900);
  });
  it('is negative in months where bills exceed provisioning', () => {
    const transfer = suggestedTransfer([rent, insurance], 3);
    expect(transfer.toNumber()).toBe(900 + 100 - (900 + 1200));
  });
});

describe('annualTotal', () => {
  it('sums all charges over 12 months', () => {
    const total = annualTotal([rent, insurance, water]);
    expect(total.toNumber()).toBe(900 * 12 + 1200 + 90 * 4);
  });
  it('ignores inactive charges', () => {
    expect(annualTotal([inactiveHeating]).toNumber()).toBe(0);
  });
});
