import { describe, it, expect } from 'vitest';
import { chargeInputSchema, chargeUpdateSchema } from '@/lib/schemas/charge';

describe('chargeInputSchema', () => {
  const base = {
    label: 'Electricité',
    amount: 120.5,
    frequency: 'monthly' as const,
    dueMonth: 1,
    categoryId: null,
    isActive: true,
  };

  it('accepts a well-formed charge', () => {
    expect(chargeInputSchema.safeParse(base).success).toBe(true);
  });

  it('rejects negative amount', () => {
    expect(chargeInputSchema.safeParse({ ...base, amount: -1 }).success).toBe(false);
  });

  it('rejects empty label', () => {
    expect(chargeInputSchema.safeParse({ ...base, label: '  ' }).success).toBe(false);
  });

  it('rejects out-of-range dueMonth', () => {
    expect(chargeInputSchema.safeParse({ ...base, dueMonth: 0 }).success).toBe(false);
    expect(chargeInputSchema.safeParse({ ...base, dueMonth: 13 }).success).toBe(false);
  });

  it('rejects unknown frequency', () => {
    expect(chargeInputSchema.safeParse({ ...base, frequency: 'weekly' as never }).success).toBe(
      false,
    );
  });
});

describe('chargeUpdateSchema', () => {
  it('accepts partial updates', () => {
    expect(chargeUpdateSchema.safeParse({ amount: 99 }).success).toBe(true);
    expect(chargeUpdateSchema.safeParse({}).success).toBe(true);
  });
});
