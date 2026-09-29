import { describe, expect, it } from 'vitest';

import { defaultPaymentDay, isCalendarDay, paidAtForDay, paymentDayWindow } from '../payment-date';

describe('paymentDayWindow', () => {
  it('opens 31 days before the first day and closes 31 days after the last', () => {
    expect(paymentDayWindow(2026, 5)).toEqual({ min: '2026-03-31', max: '2026-07-01' });
  });

  it('crosses a year boundary on both sides', () => {
    expect(paymentDayWindow(2026, 1)).toEqual({ min: '2025-12-01', max: '2026-03-03' });
    expect(paymentDayWindow(2025, 12)).toEqual({ min: '2025-10-31', max: '2026-01-31' });
  });

  it('knows a leap February', () => {
    expect(paymentDayWindow(2028, 2)).toEqual({ min: '2028-01-01', max: '2028-03-31' });
  });
});

describe('defaultPaymentDay', () => {
  it('is the due date when it has passed — the bank already debited it', () => {
    expect(defaultPaymentDay('2026-05-09', '2026-05-28')).toBe('2026-05-09');
  });

  it('is the due date when it is today', () => {
    expect(defaultPaymentDay('2026-05-28', '2026-05-28')).toBe('2026-05-28');
  });

  it('is today when the due date is still ahead — a paid day is never in the future', () => {
    expect(defaultPaymentDay('2026-06-05', '2026-05-28')).toBe('2026-05-28');
  });

  it('is today when there is no due date', () => {
    expect(defaultPaymentDay(null, '2026-05-28')).toBe('2026-05-28');
  });
});

describe('paidAtForDay', () => {
  it('stamps noon UTC — the same calendar day in Brussels, summer and winter', () => {
    expect(paidAtForDay('2026-05-09')).toBe('2026-05-09T12:00:00.000Z');
    expect(paidAtForDay('2026-01-31')).toBe('2026-01-31T12:00:00.000Z');
  });
});

describe('isCalendarDay', () => {
  it('accepts a real day and refuses a day that does not exist', () => {
    expect(isCalendarDay('2026-02-28')).toBe(true);
    expect(isCalendarDay('2028-02-29')).toBe(true);
    expect(isCalendarDay('2026-02-30')).toBe(false);
    expect(isCalendarDay('2026-13-01')).toBe(false);
    expect(isCalendarDay('2026-5-9')).toBe(false);
    expect(isCalendarDay('')).toBe(false);
  });
});
