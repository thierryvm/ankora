import { describe, it, expect } from 'vitest';

import { money } from '@/lib/domain/types';
import { markChargePaid } from '../mark-paid';
import type { ChargeRecord } from '@/lib/domain/charges/types';

const charge: ChargeRecord = Object.freeze({
  id: 'charge-1',
  workspaceId: 'ws-1',
  label: 'Loyer',
  amount: money('800.00'),
  frequency: 'monthly',
  paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  paymentDay: 5,
  dueMonth: 1,
  sortOrder: 0,
  categoryId: null,
  isActive: true,
  notes: null,
  paidFrom: 'principal',
});

describe('markChargePaid', () => {
  it('builds a payment record with the charge default amount', () => {
    const r = markChargePaid({
      charge,
      year: 2026,
      month: 5,
      paidAtIso: '2026-05-07T10:00:00Z',
      createdBy: 'user-1',
    });
    expect(r).toMatchObject({
      chargeId: 'charge-1',
      workspaceId: 'ws-1',
      periodYear: 2026,
      periodMonth: 5,
      paidAt: '2026-05-07T10:00:00Z',
      bucketId: null,
      note: null,
      createdBy: 'user-1',
    });
    expect(r.paidAmount.toString()).toBe('800');
  });

  it('honors paidAmount override', () => {
    const r = markChargePaid({
      charge,
      year: 2026,
      month: 5,
      paidAtIso: '2026-05-07T10:00:00Z',
      createdBy: 'user-1',
      overrides: { paidAmount: money('795.50') },
    });
    expect(r.paidAmount.toString()).toBe('795.5');
  });

  it('honors note override', () => {
    const r = markChargePaid({
      charge,
      year: 2026,
      month: 5,
      paidAtIso: '2026-05-07T10:00:00Z',
      createdBy: 'user-1',
      overrides: { note: 'paid via SEPA' },
    });
    expect(r.note).toBe('paid via SEPA');
  });

  it('throws on month 0', () => {
    expect(() =>
      markChargePaid({
        charge,
        year: 2026,
        month: 0,
        paidAtIso: 'x',
        createdBy: 'u',
      }),
    ).toThrow(RangeError);
  });

  it('throws on month 13', () => {
    expect(() =>
      markChargePaid({
        charge,
        year: 2026,
        month: 13,
        paidAtIso: 'x',
        createdBy: 'u',
      }),
    ).toThrow(RangeError);
  });

  it('throws on non-integer month', () => {
    expect(() =>
      markChargePaid({ charge, year: 2026, month: 5.5, paidAtIso: 'x', createdBy: 'u' }),
    ).toThrow(RangeError);
  });

  it('throws on year < 2000', () => {
    expect(() =>
      markChargePaid({ charge, year: 1999, month: 5, paidAtIso: 'x', createdBy: 'u' }),
    ).toThrow(RangeError);
  });

  it('throws on year > 2100', () => {
    expect(() =>
      markChargePaid({ charge, year: 2101, month: 5, paidAtIso: 'x', createdBy: 'u' }),
    ).toThrow(RangeError);
  });

  it('throws when the charge is inactive', () => {
    const inactive: ChargeRecord = { ...charge, isActive: false };
    expect(() =>
      markChargePaid({ charge: inactive, year: 2026, month: 5, paidAtIso: 'x', createdBy: 'u' }),
    ).toThrow(/inactive/);
  });

  it('throws on non-finite paidAmount', () => {
    expect(() =>
      markChargePaid({
        charge,
        year: 2026,
        month: 5,
        paidAtIso: 'x',
        createdBy: 'u',
        overrides: { paidAmount: money('Infinity') },
      }),
    ).toThrow(RangeError);
  });

  it('throws on negative paidAmount override', () => {
    expect(() =>
      markChargePaid({
        charge,
        year: 2026,
        month: 5,
        paidAtIso: 'x',
        createdBy: 'u',
        overrides: { paidAmount: money('-1') },
      }),
    ).toThrow(RangeError);
  });

  it('accepts paidAmount override = 0', () => {
    const r = markChargePaid({
      charge,
      year: 2026,
      month: 5,
      paidAtIso: 'x',
      createdBy: 'u',
      overrides: { paidAmount: money('0') },
    });
    expect(r.paidAmount.toString()).toBe('0');
  });

  it('accepts year 2000 (boundary)', () => {
    const r = markChargePaid({
      charge,
      year: 2000,
      month: 1,
      paidAtIso: 'x',
      createdBy: 'u',
    });
    expect(r.periodYear).toBe(2000);
  });

  it('accepts year 2100 (boundary)', () => {
    const r = markChargePaid({
      charge,
      year: 2100,
      month: 12,
      paidAtIso: 'x',
      createdBy: 'u',
    });
    expect(r.periodYear).toBe(2100);
  });

  it('accepts month 1 and 12 (boundaries)', () => {
    expect(
      markChargePaid({ charge, year: 2026, month: 1, paidAtIso: 'x', createdBy: 'u' }).periodMonth,
    ).toBe(1);
    expect(
      markChargePaid({ charge, year: 2026, month: 12, paidAtIso: 'x', createdBy: 'u' }).periodMonth,
    ).toBe(12);
  });

  it('preserves Decimal precision in paidAmount', () => {
    const r = markChargePaid({
      charge: { ...charge, amount: money('123.456789') },
      year: 2026,
      month: 5,
      paidAtIso: 'x',
      createdBy: 'u',
    });
    expect(r.paidAmount.toString()).toBe('123.456789');
  });

  it('returns null bucketId (forward-compat ADR-015)', () => {
    const r = markChargePaid({
      charge,
      year: 2026,
      month: 5,
      paidAtIso: 'x',
      createdBy: 'u',
    });
    expect(r.bucketId).toBeNull();
  });
});
