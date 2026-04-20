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

export function formatDate(
  date: Date | string | number,
  locale: Locale,
  style: DateStyle = 'long',
): string {
  return getDateFormatter(locale, { dateStyle: style }).format(toDate(date));
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

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
