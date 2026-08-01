import type Decimal from 'decimal.js';

import type { Locale } from '@/i18n/routing';

type DecimalLike = { toNumber: () => number };

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();
const numberFormatterCache = new Map<string, Intl.NumberFormat>();

function toNumber(value: number | DecimalLike | Decimal): number {
  return typeof value === 'number' ? value : value.toNumber();
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

function getCurrencyFormatter(locale: Locale, currency: string): Intl.NumberFormat {
  const key = `${locale}|${currency}`;
  let formatter = currencyFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
      // Whole euros render without ".00" (500,00 € → 500 €) while fractional
      // amounts keep both decimals (17,24 € stays, 1 234,50 € stays). Belgian
      // users don't write decimals on round euros (@thierry review 2026-06-02).
      trailingZeroDisplay: 'stripIfInteger',
    });
    currencyFormatterCache.set(key, formatter);
  }
  return formatter;
}

function getNumberFormatter(locale: Locale, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${options ? JSON.stringify(options) : ''}`;
  let formatter = numberFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormatterCache.set(key, formatter);
  }
  return formatter;
}

function getDateFormatter(
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = dateFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateFormatterCache.set(key, formatter);
  }
  return formatter;
}

export function formatCurrency(
  amount: number | DecimalLike | Decimal,
  locale: Locale,
  currency: string = 'EUR',
): string {
  return getCurrencyFormatter(locale, currency).format(toNumber(amount));
}

export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return getNumberFormatter(locale, options).format(value);
}

export function formatPercent(value: number, locale: Locale, fractionDigits: number = 0): string {
  return getNumberFormatter(locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

type DateStyle = 'full' | 'long' | 'medium' | 'short';

/** Matches a calendar day with no time component, e.g. `2026-07-18`. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function formatDate(
  date: Date | string | number,
  locale: Locale,
  style: DateStyle = 'long',
): string {
  // Date-only strings are formatted in UTC; everything else keeps the runtime
  // timezone.
  //
  // `new Date('2026-07-18')` is parsed as midnight UTC by spec, so formatting
  // it in the runtime timezone shifts it to the 17th anywhere west of
  // Greenwich — a wrong day, and a hydration mismatch between a Vercel server
  // on UTC and the visitor's browser. `formatMonth` twenty lines below already
  // passes `timeZone: 'UTC'` for exactly this reason; the inconsistency was
  // internal to this file.
  //
  // The predicate is what makes it safe to fix. Applying UTC unconditionally
  // would corrupt the three callers that pass a real instant: the account
  // deletion dates (`scheduled_for`, `cancelled_at`, both `timestamptz`) read
  // by `deletion-status/page.tsx` and `SettingsClient.tsx`. A Belgian user
  // requesting deletion between 00:00 and 02:00 local would be shown an
  // erasure date off by one day — a legally binding figure.
  const isDateOnly = typeof date === 'string' && DATE_ONLY.test(date);
  return getDateFormatter(locale, {
    dateStyle: style,
    ...(isDateOnly ? { timeZone: 'UTC' } : {}),
  }).format(toDate(date));
}

export function formatDateTime(
  date: Date | string | number,
  locale: Locale,
  options: { dateStyle?: DateStyle; timeStyle?: DateStyle } = {
    dateStyle: 'long',
    timeStyle: 'short',
  },
): string {
  return getDateFormatter(locale, options).format(toDate(date));
}

type MonthStyle = 'long' | 'short' | 'narrow';

export function formatMonth(
  monthIndex: number,
  locale: Locale,
  style: MonthStyle = 'long',
): string {
  if (!Number.isInteger(monthIndex) || monthIndex < 1 || monthIndex > 12) return '—';
  const reference = new Date(Date.UTC(2000, monthIndex - 1, 1));
  const label = getDateFormatter(locale, { month: style, timeZone: 'UTC' }).format(reference);
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}

/**
 * Month name as it should read INSIDE a sentence — « fin juin 2029 », « en mars
 * 2027 » — rather than at the head of a heading or a table cell.
 *
 * `formatMonth` capitalises unconditionally, which is right where it is used
 * today (titles, cells) and wrong the moment a month is interpolated mid-copy:
 * French, Spanish and Dutch all lowercase month names there, and only German
 * capitalises every noun. Delegating to `toLocaleLowerCase(locale)` keeps that
 * distinction in the CLDR data instead of a per-language exception here.
 */
export function formatMonthInSentence(
  monthIndex: number,
  locale: Locale,
  style: MonthStyle = 'long',
): string {
  const label = formatMonth(monthIndex, locale, style);
  if (label === '—') return label;
  // German capitalises nouns, month names included; every other Ankora locale
  // lowercases them in running text.
  if (locale.startsWith('de')) return label;
  return label.charAt(0).toLocaleLowerCase(locale) + label.slice(1);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
