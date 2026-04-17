import { describe, it, expect } from 'vitest';
import { money } from '@/lib/domain/types';
import { summarizeExpenses, remainingBudget, dailyAllowance } from '@/lib/domain/balance';
import type { Expense } from '@/lib/domain/types';

const exp = (id: string, amount: number, categoryId: string | null): Expense => ({
  id,
  label: `e${id}`,
  amount: money(amount),
  occurredOn: '2026-04-15',
  categoryId,
  note: null,
  paidFrom: 'vie_courante',
});

describe('summarizeExpenses', () => {
  it('totals and groups by category', () => {
    const summary = summarizeExpenses([
      exp('1', 50, 'groceries'),
      exp('2', 30, 'groceries'),
      exp('3', 20, 'transport'),
      exp('4', 10, null),
    ]);
    expect(summary.totalSpent.toNumber()).toBe(110);
    expect(summary.count).toBe(4);
    expect(summary.byCategoryId.get('groceries')?.toNumber()).toBe(80);
    expect(summary.byCategoryId.get('transport')?.toNumber()).toBe(20);
    expect(summary.byCategoryId.get(null)?.toNumber()).toBe(10);
  });

  it('handles empty input', () => {
    const summary = summarizeExpenses([]);
    expect(summary.totalSpent.toNumber()).toBe(0);
    expect(summary.count).toBe(0);
    expect(summary.byCategoryId.size).toBe(0);
  });
});

describe('remainingBudget', () => {
  it('subtracts charges and variable spend from income', () => {
    expect(remainingBudget(money(2500), money(1000), money(400)).toNumber()).toBe(1100);
  });
  it('can return negative values', () => {
    expect(remainingBudget(money(1000), money(900), money(200)).toNumber()).toBe(-100);
  });
  it('rejects negative inputs', () => {
    expect(() => remainingBudget(money(-1), money(0), money(0))).toThrow(RangeError);
    expect(() => remainingBudget(money(0), money(-1), money(0))).toThrow(RangeError);
    expect(() => remainingBudget(money(0), money(0), money(-1))).toThrow(RangeError);
  });
});

describe('dailyAllowance', () => {
  it('splits remaining budget across days', () => {
    expect(dailyAllowance(money(300), 15).toNumber()).toBe(20);
  });
  it('returns 0 if no days left', () => {
    expect(dailyAllowance(money(100), 0).toNumber()).toBe(0);
  });
  it('returns 0 if remaining budget is negative', () => {
    expect(dailyAllowance(money(-50), 10).toNumber()).toBe(0);
  });
  it('returns 0 if remaining is exactly 0', () => {
    expect(dailyAllowance(money(0), 10).toNumber()).toBe(0);
  });
});
