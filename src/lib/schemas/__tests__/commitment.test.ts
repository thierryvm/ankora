import { describe, it, expect } from 'vitest';

import { commitmentInputSchema, commitmentUpdateSchema } from '../commitment';

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

  it('accepts the boundary values the DB accepts (paymentDay 1/31, instalments 1/600)', () => {
    expect(commitmentInputSchema.safeParse({ ...validDebt, paymentDay: 1 }).success).toBe(true);
    expect(commitmentInputSchema.safeParse({ ...validDebt, paymentDay: 31 }).success).toBe(true);
    expect(commitmentInputSchema.safeParse({ ...validDebt, installmentsTotal: 600 }).success).toBe(
      true,
    );
    expect(
      commitmentInputSchema.safeParse({
        ...validDebt,
        kind: 'one_off',
        installmentsTotal: 1,
      }).success,
    ).toBe(true);
  });

  it('rejects the values just outside those bounds', () => {
    expect(commitmentInputSchema.safeParse({ ...validDebt, paymentDay: 0 }).success).toBe(false);
    expect(commitmentInputSchema.safeParse({ ...validDebt, paymentDay: 32 }).success).toBe(false);
    expect(commitmentInputSchema.safeParse({ ...validDebt, installmentsTotal: 0 }).success).toBe(
      false,
    );
  });

  it('rejects an unknown frequency and a non-UUID category', () => {
    expect(commitmentInputSchema.safeParse({ ...validDebt, frequency: 'weekly' }).success).toBe(
      false,
    );
    expect(commitmentInputSchema.safeParse({ ...validDebt, categoryId: 'nope' }).success).toBe(
      false,
    );
  });

  it('rejects an amount above the UI sanity ceiling', () => {
    expect(commitmentInputSchema.safeParse({ ...validDebt, totalAmount: 10_000_001 }).success).toBe(
      false,
    );
  });
});

describe('commitmentUpdateSchema', () => {
  it('accepts a lone label edit (rules about untouched fields must not fire)', () => {
    expect(commitmentUpdateSchema.safeParse({ label: 'Crédit auto' }).success).toBe(true);
    expect(commitmentUpdateSchema.safeParse({ notes: 'renégocié' }).success).toBe(true);
    expect(commitmentUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a lone instalment-count bump (the stored row keeps its amount)', () => {
    expect(commitmentUpdateSchema.safeParse({ installmentsTotal: 24 }).success).toBe(true);
  });

  it('rejects turning a commitment into a one-off spread over several instalments', () => {
    const r = commitmentUpdateSchema.safeParse({ kind: 'one_off', installmentsTotal: 3 });
    expect(r.success).toBe(false);
  });

  it('accepts kind alone, and kind + a single instalment', () => {
    expect(commitmentUpdateSchema.safeParse({ kind: 'one_off' }).success).toBe(true);
    expect(
      commitmentUpdateSchema.safeParse({ kind: 'one_off', installmentsTotal: 1 }).success,
    ).toBe(true);
  });

  it('rejects a patch that raises the count while explicitly clearing the amount', () => {
    // Mirrors commitments_installment_amount_required for the patch case.
    const r = commitmentUpdateSchema.safeParse({
      installmentsTotal: 12,
      installmentAmount: undefined,
    });
    expect(r.success).toBe(false);
  });

  it('accepts raising the count together with a valid amount', () => {
    expect(
      commitmentUpdateSchema.safeParse({ installmentsTotal: 12, installmentAmount: 150 }).success,
    ).toBe(true);
  });
});
