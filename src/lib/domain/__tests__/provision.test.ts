import { describe, it, expect } from 'vitest';
import { money } from '@/lib/domain/types';
import { assessHealth, recoveryPlan, safetyBuffer } from '@/lib/domain/provision';
import type { Charge } from '@/lib/domain/types';

const charges: Charge[] = [
  {
    id: 'c1',
    label: 'Loyer',
    amount: money(900),
    frequency: 'monthly',
    dueMonth: 1,
    categoryId: null,
    isActive: true,
  },
  {
    id: 'c2',
    label: 'Assurance',
    amount: money(1200),
    frequency: 'annual',
    dueMonth: 3,
    categoryId: null,
    isActive: true,
  },
];
// Monthly provision target = 900 + 100 = 1000

describe('assessHealth', () => {
  it('is healthy when balance matches target', () => {
    const health = assessHealth(charges, money(3000), 3);
    expect(health.target.toNumber()).toBe(3000);
    expect(health.delta.toNumber()).toBe(0);
    expect(health.score).toBe(1);
    expect(health.status).toBe('healthy');
  });

  it('is warning when balance is 70-95% of target', () => {
    const health = assessHealth(charges, money(2400), 3);
    expect(health.status).toBe('warning');
    expect(health.score).toBe(0.8);
  });

  it('is critical when balance is below 70% of target', () => {
    const health = assessHealth(charges, money(1500), 3);
    expect(health.status).toBe('critical');
    expect(health.delta.toNumber()).toBe(-1500);
  });

  it('caps score at 2 when over-provisioned', () => {
    const health = assessHealth(charges, money(10_000), 3);
    expect(health.score).toBe(2);
    expect(health.status).toBe('healthy');
  });

  it('treats empty charges as healthy', () => {
    const health = assessHealth([], money(0), 1);
    expect(health.status).toBe('healthy');
    expect(health.score).toBe(1);
  });

  it('clamps monthsElapsed at 12', () => {
    const health = assessHealth(charges, money(12_000), 24);
    expect(health.target.toNumber()).toBe(12_000);
  });

  it('throws if monthsElapsed < 1', () => {
    expect(() => assessHealth(charges, money(0), 0)).toThrow(RangeError);
  });
});

describe('recoveryPlan', () => {
  it('returns no plan when healthy', () => {
    const health = assessHealth(charges, money(3000), 3);
    const plan = recoveryPlan(health);
    expect(plan.months).toBe(0);
    expect(plan.monthlyExtra.toNumber()).toBe(0);
  });

  it('spreads deficit over 3 months by default', () => {
    const health = assessHealth(charges, money(2100), 3);
    const plan = recoveryPlan(health);
    expect(plan.months).toBe(3);
    expect(plan.totalToRecover.toNumber()).toBe(900);
    expect(plan.monthlyExtra.toNumber()).toBe(300);
  });

  it('honors custom recovery window', () => {
    const health = assessHealth(charges, money(2400), 3);
    const plan = recoveryPlan(health, 6);
    expect(plan.months).toBe(6);
    expect(plan.monthlyExtra.toNumber()).toBe(100);
  });

  it('rejects invalid recovery window', () => {
    const health = assessHealth(charges, money(0), 1);
    expect(() => recoveryPlan(health, 0)).toThrow(RangeError);
  });
});

describe('safetyBuffer', () => {
  it('computes worst-case annual buffer', () => {
    expect(safetyBuffer(charges).toNumber()).toBe(900 * 12 + 1200);
  });
  it('ignores inactive charges', () => {
    const inactive: Charge = { ...charges[0]!, id: 'inactive', isActive: false };
    expect(safetyBuffer([inactive]).toNumber()).toBe(0);
  });
});
