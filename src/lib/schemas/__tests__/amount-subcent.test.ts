import { describe, expect, it } from 'vitest';

import { chargeInputSchema } from '@/lib/schemas/charge';
import { expenseInputSchema } from '@/lib/schemas/expense';

// Security review, tour 56 (I1) — `.positive()` let 0.004 through, and the
// numeric(12,2) column rounded it to a 0 € row: the server is the only real
// barrier, so a third decimal is refused there, never rounded (ADR-045 D19).
describe('amount schemas refuse a sub-cent amount', () => {
  it.each([
    ['charge', chargeInputSchema.shape.amount, 'charge.amount.subCent'],
    ['expense', expenseInputSchema.shape.amount, 'expense.amount.subCent'],
  ] as const)('%s: 0.004 and 5.999 are refused, 5.9 accepted', (_name, amount, message) => {
    for (const bad of [0.004, 5.999]) {
      const r = amount.safeParse(bad);
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.message).toBe(message);
    }
    expect(amount.safeParse(5.9).success).toBe(true);
    expect(amount.safeParse(505.05).success).toBe(true);
  });
});
