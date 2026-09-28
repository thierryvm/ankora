import { describe, expect, it } from 'vitest';

import { parseAmountInput } from '@/lib/i18n/parse-amount';

// Security review, tour 56 (B1) — the base stores numeric(12,2) and ROUNDS a
// third decimal: « 0,001 » became a 0 € bill, « 1.234 » (a thousand, written
// the Belgian way) became 1,23 €. More than two decimals is ambiguous or
// sub-cent: refused, never guessed.
describe('parseAmountInput — never more than two decimals', () => {
  it.each(['1.234', '1,234', '1.234.567', '5,999', '0,001', '0.001'])('refuses %s', (raw) => {
    expect(parseAmountInput(raw)).toBeNull();
    expect(parseAmountInput(raw, { allowZero: true })).toBeNull();
  });

  it.each([
    ['5,90', 5.9],
    ['5.9', 5.9],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['705', 705],
  ])('still reads %s as %d', (raw, value) => {
    expect(parseAmountInput(raw)).toBe(value);
  });
});
