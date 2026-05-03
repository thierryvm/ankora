import { describe, it, expect } from 'vitest';

import {
  accountDisplayNameSchema,
  accountKindSchema,
  accountRenameByTypeSchema,
  accountTypeSchema,
} from '@/lib/schemas/account';

describe('accountTypeSchema', () => {
  it.each(['income_bills', 'provisions', 'daily_card'] as const)('accepts %s', (value) => {
    expect(accountTypeSchema.safeParse(value).success).toBe(true);
  });

  it('rejects legacy kind values', () => {
    expect(accountTypeSchema.safeParse('principal').success).toBe(false);
    expect(accountTypeSchema.safeParse('vie_courante').success).toBe(false);
    expect(accountTypeSchema.safeParse('epargne').success).toBe(false);
  });

  it('rejects unrelated strings', () => {
    expect(accountTypeSchema.safeParse('').success).toBe(false);
    expect(accountTypeSchema.safeParse('savings').success).toBe(false);
  });
});

describe('accountKindSchema (legacy, kept for back-compat)', () => {
  it('still accepts the 3 legacy kinds', () => {
    expect(accountKindSchema.safeParse('principal').success).toBe(true);
    expect(accountKindSchema.safeParse('vie_courante').success).toBe(true);
    expect(accountKindSchema.safeParse('epargne').success).toBe(true);
  });
});

describe('accountDisplayNameSchema', () => {
  it('accepts a typical bank name', () => {
    expect(accountDisplayNameSchema.parse('Belfius')).toBe('Belfius');
  });

  it('trims whitespace', () => {
    expect(accountDisplayNameSchema.parse('  Belfius  ')).toBe('Belfius');
  });

  it('rejects empty strings (after trim)', () => {
    expect(accountDisplayNameSchema.safeParse('   ').success).toBe(false);
  });

  it('rejects strings longer than 50 characters', () => {
    const tooLong = 'a'.repeat(51);
    expect(accountDisplayNameSchema.safeParse(tooLong).success).toBe(false);
  });

  it('accepts exactly 50 characters', () => {
    const max = 'a'.repeat(50);
    expect(accountDisplayNameSchema.parse(max)).toBe(max);
  });

  it('rejects HTML-like characters that could enable injection', () => {
    expect(accountDisplayNameSchema.safeParse('<script>').success).toBe(false);
    expect(accountDisplayNameSchema.safeParse('Belfius>').success).toBe(false);
    expect(accountDisplayNameSchema.safeParse('<Belfius').success).toBe(false);
  });

  it('accepts accented characters and ampersands', () => {
    expect(accountDisplayNameSchema.parse('Épargne & Provisions')).toBe('Épargne & Provisions');
  });

  it('accepts emoji (no HTML restriction beyond < / >)', () => {
    expect(accountDisplayNameSchema.parse('Belfius 🏦')).toBe('Belfius 🏦');
  });
});

describe('accountRenameByTypeSchema', () => {
  it('accepts a well-formed payload', () => {
    const result = accountRenameByTypeSchema.safeParse({
      accountType: 'income_bills',
      displayName: 'Belfius',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown account_type', () => {
    expect(
      accountRenameByTypeSchema.safeParse({
        accountType: 'principal',
        displayName: 'Belfius',
      }).success,
    ).toBe(false);
  });

  it('rejects empty displayName', () => {
    expect(
      accountRenameByTypeSchema.safeParse({
        accountType: 'income_bills',
        displayName: '   ',
      }).success,
    ).toBe(false);
  });

  it('rejects displayName containing < or >', () => {
    expect(
      accountRenameByTypeSchema.safeParse({
        accountType: 'income_bills',
        displayName: '<img onerror=...>',
      }).success,
    ).toBe(false);
  });

  it('exposes field-level error path on accountType', () => {
    const result = accountRenameByTypeSchema.safeParse({
      accountType: 'unknown',
      displayName: 'Belfius',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.accountType).toBeDefined();
    }
  });
});
