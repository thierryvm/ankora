import { describe, expect, it } from 'vitest';

import { chargeInputSchema, chargeUpdateSchema } from '../charge';

/**
 * A bill is never recorded at 0 €.
 *
 * Incident: « Modifier la facture » read its amount through a numeric field,
 * which blanks a comma-typed « 5,90 » to an empty string; `Number('')` is 0,
 * and the schema accepted 0. The bill was saved at 0 € without a word. The
 * refusal lives HERE, at the boundary, so no caller — a form, a replayed
 * request — can write a zero or negative bill.
 *
 * Figures are fictitious.
 */

const VALID = {
  label: 'Assurance habitation',
  amount: 505,
  frequency: 'monthly' as const,
  dueMonth: 1,
  categoryId: null,
};

type Issue = { path: PropertyKey[]; message: string };

function amountMessages(result: { success: boolean; error?: { issues: Issue[] } }) {
  return (result.error?.issues ?? [])
    .filter((issue) => issue.path[0] === 'amount')
    .map((issue) => issue.message);
}

describe('chargeInputSchema — the amount is strictly positive', () => {
  it('accepts a positive amount with cents', () => {
    const result = chargeInputSchema.safeParse({ ...VALID, amount: 5.9 });
    expect(result.success).toBe(true);
  });

  it.each([
    ['zero', 0],
    ['a negative amount', -5.9],
  ])('refuses %s, saying it must be above zero', (_label, amount) => {
    const result = chargeInputSchema.safeParse({ ...VALID, amount });
    expect(result.success).toBe(false);
    expect(amountMessages(result)).toEqual(['charge.amount.notPositive']);
  });

  it('refuses a bill with no amount at all', () => {
    const withoutAmount = {
      label: VALID.label,
      frequency: VALID.frequency,
      dueMonth: VALID.dueMonth,
      categoryId: VALID.categoryId,
    };
    const result = chargeInputSchema.safeParse(withoutAmount);
    expect(result.success).toBe(false);
    expect(amountMessages(result)).toEqual(['charge.amount.invalid']);
  });
});

describe('chargeUpdateSchema — a patch may leave the amount alone, never zero it', () => {
  it('accepts a patch that does not carry the amount', () => {
    // An edit of the label alone must not be refused for a field it never sent.
    expect(chargeUpdateSchema.safeParse({ label: 'Assurance auto' }).success).toBe(true);
  });

  it('accepts a patch carrying a positive amount', () => {
    expect(chargeUpdateSchema.safeParse({ amount: 5.9 }).success).toBe(true);
  });

  it.each([
    ['zero', 0],
    ['a negative amount', -705],
  ])('refuses a patch setting the amount to %s', (_label, amount) => {
    const result = chargeUpdateSchema.safeParse({ amount });
    expect(result.success).toBe(false);
    expect(amountMessages(result)).toEqual(['charge.amount.notPositive']);
  });
});
