import { describe, expect, it } from 'vitest';

import { isCategoryKindAllowedFor } from '../category-use';

describe('isCategoryKindAllowedFor', () => {
  it('lets an expense use a variable category only', () => {
    expect(isCategoryKindAllowedFor('expense', 'variable')).toBe(true);
    expect(isCategoryKindAllowedFor('expense', 'fixed')).toBe(false);
    expect(isCategoryKindAllowedFor('expense', 'income')).toBe(false);
  });

  it.each(['charge', 'commitment'] as const)(
    'lets a %s use a fixed or variable category, never income',
    (use) => {
      expect(isCategoryKindAllowedFor(use, 'fixed')).toBe(true);
      expect(isCategoryKindAllowedFor(use, 'variable')).toBe(true);
      expect(isCategoryKindAllowedFor(use, 'income')).toBe(false);
    },
  );

  it.each(['expense', 'charge', 'commitment'] as const)(
    'refuses an unknown kind for a %s',
    (use) => {
      expect(isCategoryKindAllowedFor(use, 'savings')).toBe(false);
      expect(isCategoryKindAllowedFor(use, '')).toBe(false);
    },
  );
});
