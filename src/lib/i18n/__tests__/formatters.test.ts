import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';

import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMonth,
  formatNumber,
  formatPercent,
} from '@/lib/i18n/formatters';

// Normalize NBSP / NNBSP / thin-space before asserting — Intl uses them
// inside currency and number formatting, and assertions read cleaner without them.
const squash = (s: string) => s.replace(/[\u00A0\u202F\u2009]/g, ' ');

describe('formatCurrency', () => {
  it('formats EUR in fr-BE with French decimal comma', () => {
    expect(squash(formatCurrency(1234.5, 'fr-BE'))).toBe('1 234,50 €');
  });

  it('formats EUR in en locale with dot decimal', () => {
    expect(squash(formatCurrency(1234.5, 'en'))).toBe('€1,234.50');
  });

  it('formats EUR in nl-BE, es-ES, de-DE consistently', () => {
    expect(squash(formatCurrency(1234.5, 'nl-BE'))).toBe('€ 1.234,50');
    expect(squash(formatCurrency(1234.5, 'es-ES'))).toBe('1234,50 €');
    expect(squash(formatCurrency(1234.5, 'de-DE'))).toBe('1.234,50 €');
  });

  it('accepts Decimal values from the domain layer', () => {
    expect(squash(formatCurrency(new Decimal('1234.50'), 'fr-BE'))).toBe('1 234,50 €');
  });

  it('handles zero and negative amounts', () => {
    expect(squash(formatCurrency(0, 'fr-BE'))).toBe('0,00 €');
    expect(squash(formatCurrency(-42.75, 'fr-BE'))).toBe('-42,75 €');
  });

  it('handles large amounts with grouping', () => {
    expect(squash(formatCurrency(1_234_567.89, 'fr-BE'))).toBe('1 234 567,89 €');
  });

  it('supports a non-default currency', () => {
    expect(squash(formatCurrency(100, 'en', 'USD'))).toBe('$100.00');
  });
});

describe('formatNumber', () => {
  it('applies locale-specific grouping and decimals', () => {
    expect(squash(formatNumber(1234567.89, 'fr-BE'))).toBe('1 234 567,89');
    expect(squash(formatNumber(1234567.89, 'en'))).toBe('1,234,567.89');
    expect(squash(formatNumber(1234567.89, 'de-DE'))).toBe('1.234.567,89');
  });

  it('respects Intl options overrides', () => {
    expect(squash(formatNumber(0.5, 'fr-BE', { minimumFractionDigits: 3 }))).toBe('0,500');
  });
});

describe('formatPercent', () => {
  it('formats 0.25 as 25 %', () => {
    expect(squash(formatPercent(0.25, 'fr-BE'))).toBe('25 %');
    expect(squash(formatPercent(0.25, 'en'))).toBe('25%');
  });

  it('supports fraction digits', () => {
    expect(squash(formatPercent(0.1234, 'fr-BE', 2))).toBe('12,34 %');
  });
});

describe('formatDate', () => {
  const date = new Date('2026-04-18T12:00:00Z');

  it('formats in long style for fr-BE', () => {
    expect(squash(formatDate(date, 'fr-BE'))).toBe('18 avril 2026');
  });

  it('formats in long style for en', () => {
    expect(squash(formatDate(date, 'en'))).toBe('April 18, 2026');
  });

  it('accepts a date string', () => {
    expect(squash(formatDate('2026-04-18T12:00:00Z', 'fr-BE'))).toBe('18 avril 2026');
  });

  it('supports short style for edge-of-month dates', () => {
    const endOfMonth = new Date('2026-01-31T12:00:00Z');
    expect(squash(formatDate(endOfMonth, 'fr-BE', 'short'))).toBe('31/01/26');
  });
});

describe('formatDateTime', () => {
  it('formats long date + short time in fr-BE', () => {
    // Use a midday UTC anchor to dodge DST-induced flakiness across CI runners.
    const result = squash(formatDateTime(new Date('2026-04-18T12:00:00Z'), 'fr-BE'));
    expect(result).toContain('18 avril 2026');
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});

describe('formatMonth', () => {
  it('returns capitalized month labels in fr-BE (1-indexed)', () => {
    expect(formatMonth(1, 'fr-BE')).toBe('Janvier');
    expect(formatMonth(4, 'fr-BE')).toBe('Avril');
    expect(formatMonth(12, 'fr-BE')).toBe('Décembre');
  });

  it('returns capitalized month labels in en, nl-BE, es-ES, de-DE', () => {
    expect(formatMonth(4, 'en')).toBe('April');
    expect(formatMonth(4, 'nl-BE')).toBe('April');
    expect(formatMonth(4, 'es-ES')).toBe('Abril');
    expect(formatMonth(4, 'de-DE')).toBe('April');
  });

  it('supports short style', () => {
    expect(formatMonth(4, 'en', 'short')).toBe('Apr');
  });

  it('returns em dash for out-of-range input', () => {
    expect(formatMonth(0, 'fr-BE')).toBe('—');
    expect(formatMonth(13, 'fr-BE')).toBe('—');
    expect(formatMonth(1.5, 'fr-BE')).toBe('—');
  });
});
