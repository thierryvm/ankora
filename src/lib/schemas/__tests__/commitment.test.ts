import { describe, it, expect } from 'vitest';

import { commitmentInputSchema } from '../commitment';

const validDebt = {
  label: 'Crédit voiture',
  kind: 'debt' as const,
  totalAmount: 4200,
  installmentAmount: 250,
  installmentsTotal: 17,
  startYear: 2026,
  startMonth: 8,
  paymentDay: 15,
  frequency: 'monthly' as const,
};

describe('commitmentInputSchema', () => {
  it('accepts a debt and applies the defaults', () => {
    const parsed = commitmentInputSchema.parse(validDebt);
    expect(parsed.isActive).toBe(true);
    expect(parsed.categoryId).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it('accepts a one-off without an instalment amount', () => {
    const parsed = commitmentInputSchema.parse({
      label: 'Entretien chaudière',
      kind: 'one_off',
      totalAmount: 340,
      installmentsTotal: 1,
      startYear: 2026,
      startMonth: 10,
    });
    expect(parsed.installmentAmount).toBeUndefined();
    expect(parsed.frequency).toBe('monthly');
    expect(parsed.paymentDay).toBe(1);
  });

  it('rejects a one-off spread over several instalments (DB CHECK mirror)', () => {
    const r = commitmentInputSchema.safeParse({ ...validDebt, kind: 'one_off' });
    expect(r.success).toBe(false);
  });

  it('rejects a multi-instalment commitment without an instalment amount', () => {
    const { installmentAmount: _omitted, ...noAmount } = validDebt;
    const r = commitmentInputSchema.safeParse(noAmount);
    expect(r.success).toBe(false);
  });

  it('rejects a negative balance and an out-of-range month', () => {
    expect(commitmentInputSchema.safeParse({ ...validDebt, totalAmount: -1 }).success).toBe(false);
    expect(commitmentInputSchema.safeParse({ ...validDebt, startMonth: 13 }).success).toBe(false);
  });

  it('rejects an empty label and more than 600 instalments', () => {
    expect(commitmentInputSchema.safeParse({ ...validDebt, label: '  ' }).success).toBe(false);
    expect(commitmentInputSchema.safeParse({ ...validDebt, installmentsTotal: 601 }).success).toBe(
      false,
    );
  });
});
