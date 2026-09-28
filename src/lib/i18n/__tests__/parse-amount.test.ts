import { describe, expect, it } from 'vitest';

import { parseAmountInput } from '../parse-amount';

/**
 * One reader for every amount field of the app.
 *
 * It left `AddExpenseSheet.tsx` for this module because five other forms were
 * reading their amount with `Number(raw.replace(',', '.'))` behind a numeric
 * field — which blanks « 5,90 » to an empty string, and `Number('')` is 0.
 * The sheet's own cases stay in its suite; these are the shared contract.
 * Figures are fictitious.
 */
describe('parseAmountInput — strictly positive (the default)', () => {
  it.each([
    ['5,90', 5.9],
    ['5.90', 5.9],
    ['505', 505],
    ['1.234,56', 1234.56],
    ['1 234,56', 1234.56],
  ])('reads %s as %s', (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it.each([[''], ['   '], ['abc'], ['0'], ['0,00'], ['-5,90'], ['1,2,3']])(
    'refuses %j',
    (input) => {
      expect(parseAmountInput(input)).toBeNull();
    },
  );
});

describe('parseAmountInput — zero allowed, for the fields whose rule is « 0 or more »', () => {
  it.each([
    ['5,90', 5.9],
    ['0', 0],
    ['0,00', 0],
  ])('reads %s as %s', (input, expected) => {
    expect(parseAmountInput(input, { allowZero: true })).toBe(expected);
  });

  it.each([[''], ['abc'], ['-5,90']])('still refuses %j', (input) => {
    expect(parseAmountInput(input, { allowZero: true })).toBeNull();
  });
});
