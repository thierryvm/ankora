import { describe, it, expect } from 'vitest';

import { money } from '@/lib/domain/types';
import { updateCharge, validateChargeUpdate } from '../update';
import type { ChargeRecord } from '../types';

const baseCharge: ChargeRecord = Object.freeze({
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

describe('validateChargeUpdate', () => {
  it('accepts an empty update', () => {
    expect(validateChargeUpdate({})).toEqual({ ok: true });
  });

  it('rejects empty label', () => {
    const r = validateChargeUpdate({ label: '   ' });
    expect(r).toEqual({ ok: false, errors: { label: ['charge.label.required'] } });
  });

  it('rejects label too long', () => {
    const r = validateChargeUpdate({ label: 'x'.repeat(121) });
    expect(r.ok).toBe(false);
  });

  it('accepts label exactly 120 chars', () => {
    expect(validateChargeUpdate({ label: 'x'.repeat(120) })).toEqual({ ok: true });
  });

  it('rejects negative amount', () => {
    const r = validateChargeUpdate({ amount: money('-1') });
    expect(r).toEqual({ ok: false, errors: { amount: ['charge.amount.negative'] } });
  });

  it('rejects amount > 1_000_000', () => {
    const r = validateChargeUpdate({ amount: money('1000001') });
    expect(r).toEqual({ ok: false, errors: { amount: ['charge.amount.tooHigh'] } });
  });

  it('rejects non-finite amount', () => {
    const r = validateChargeUpdate({ amount: money('Infinity') });
    expect(r.ok).toBe(false);
  });

  it('rejects empty paymentMonths', () => {
    const r = validateChargeUpdate({ paymentMonths: [] });
    expect(r).toEqual({ ok: false, errors: { paymentMonths: ['charge.paymentMonths.empty'] } });
  });

  it('rejects paymentMonths with > 12 entries', () => {
    const r = validateChargeUpdate({ paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1] });
    expect(r).toEqual({ ok: false, errors: { paymentMonths: ['charge.paymentMonths.tooMany'] } });
  });

  it('rejects paymentMonths out of range', () => {
    expect(validateChargeUpdate({ paymentMonths: [0, 5] }).ok).toBe(false);
    expect(validateChargeUpdate({ paymentMonths: [13] }).ok).toBe(false);
    expect(validateChargeUpdate({ paymentMonths: [1.5] }).ok).toBe(false);
  });

  it('accepts trimestrielle [3,6,9,12]', () => {
    expect(validateChargeUpdate({ paymentMonths: [3, 6, 9, 12] })).toEqual({ ok: true });
  });

  it('rejects paymentDay out of [1..31]', () => {
    expect(validateChargeUpdate({ paymentDay: 0 }).ok).toBe(false);
    expect(validateChargeUpdate({ paymentDay: 32 }).ok).toBe(false);
    expect(validateChargeUpdate({ paymentDay: 5.5 }).ok).toBe(false);
  });

  it('accepts paymentDay 1 and 31', () => {
    expect(validateChargeUpdate({ paymentDay: 1 })).toEqual({ ok: true });
    expect(validateChargeUpdate({ paymentDay: 31 })).toEqual({ ok: true });
  });

  it('rejects negative or non-integer sortOrder', () => {
    expect(validateChargeUpdate({ sortOrder: -1 }).ok).toBe(false);
    expect(validateChargeUpdate({ sortOrder: 1.5 }).ok).toBe(false);
  });

  it('accepts sortOrder 0', () => {
    expect(validateChargeUpdate({ sortOrder: 0 })).toEqual({ ok: true });
  });

  it('rejects notes > 500 chars', () => {
    const r = validateChargeUpdate({ notes: 'x'.repeat(501) });
    expect(r.ok).toBe(false);
  });

  it('accepts notes exactly 500 chars and null', () => {
    expect(validateChargeUpdate({ notes: 'x'.repeat(500) })).toEqual({ ok: true });
    expect(validateChargeUpdate({ notes: null })).toEqual({ ok: true });
  });
});

describe('updateCharge', () => {
  it('returns equal record on empty update', () => {
    const next = updateCharge(baseCharge, {});
    expect(next).toEqual(baseCharge);
    expect(next).not.toBe(baseCharge); // new reference, immutable
  });

  it('trims label', () => {
    const next = updateCharge(baseCharge, { label: '  Internet  ' });
    expect(next.label).toBe('Internet');
  });

  it('updates amount with Decimal precision', () => {
    const next = updateCharge(baseCharge, { amount: money('800.123456789') });
    expect(next.amount.toString()).toBe('800.123456789');
  });

  it('updates frequency', () => {
    const next = updateCharge(baseCharge, { frequency: 'annual' });
    expect(next.frequency).toBe('annual');
  });

  it('sorts paymentMonths ascending', () => {
    const next = updateCharge(baseCharge, { paymentMonths: [12, 3, 6, 9] });
    expect(next.paymentMonths).toEqual([3, 6, 9, 12]);
  });

  it('de-duplicates paymentMonths', () => {
    const next = updateCharge(baseCharge, { paymentMonths: [3, 6, 3, 9, 6] });
    expect(next.paymentMonths).toEqual([3, 6, 9]);
  });

  it('keeps dueMonth in sync with paymentMonths[0]', () => {
    const next = updateCharge(baseCharge, { paymentMonths: [9, 3] });
    expect(next.dueMonth).toBe(3);
  });

  it('does NOT touch dueMonth if paymentMonths is omitted', () => {
    const next = updateCharge(baseCharge, { label: 'Renamed' });
    expect(next.dueMonth).toBe(baseCharge.dueMonth);
  });

  it('updates paymentDay', () => {
    const next = updateCharge(baseCharge, { paymentDay: 28 });
    expect(next.paymentDay).toBe(28);
  });

  it('updates sortOrder', () => {
    const next = updateCharge(baseCharge, { sortOrder: 7 });
    expect(next.sortOrder).toBe(7);
  });

  it('sets categoryId to null', () => {
    const c: ChargeRecord = { ...baseCharge, categoryId: 'cat-1' };
    const next = updateCharge(c, { categoryId: null });
    expect(next.categoryId).toBeNull();
  });

  it('sets categoryId to a uuid', () => {
    const next = updateCharge(baseCharge, { categoryId: 'cat-2' });
    expect(next.categoryId).toBe('cat-2');
  });

  it('toggles isActive', () => {
    const next = updateCharge(baseCharge, { isActive: false });
    expect(next.isActive).toBe(false);
  });

  it('normalizes empty notes to null', () => {
    const c: ChargeRecord = { ...baseCharge, notes: 'something' };
    const next = updateCharge(c, { notes: '' });
    expect(next.notes).toBeNull();
  });

  it('preserves notes when undefined', () => {
    const c: ChargeRecord = { ...baseCharge, notes: 'keep me' };
    const next = updateCharge(c, { label: 'Renamed' });
    expect(next.notes).toBe('keep me');
  });

  it('updates paidFrom', () => {
    const next = updateCharge(baseCharge, { paidFrom: 'epargne' });
    expect(next.paidFrom).toBe('epargne');
  });

  it('throws on invalid input', () => {
    expect(() => updateCharge(baseCharge, { amount: money('-1') })).toThrow(/invalid input/);
  });

  it('does not mutate the input record', () => {
    updateCharge(baseCharge, { label: 'New' });
    expect(baseCharge.label).toBe('Loyer');
  });

  it('preserves immutable id and workspaceId', () => {
    const next = updateCharge(baseCharge, { label: 'New' });
    expect(next.id).toBe(baseCharge.id);
    expect(next.workspaceId).toBe(baseCharge.workspaceId);
  });

  it('handles multiple field updates atomically', () => {
    const next = updateCharge(baseCharge, {
      label: 'Internet',
      amount: money('59.99'),
      paymentMonths: [3, 6, 9, 12],
      paymentDay: 15,
      categoryId: 'cat-abonnements',
    });
    expect(next.label).toBe('Internet');
    expect(next.amount.toString()).toBe('59.99');
    expect(next.paymentMonths).toEqual([3, 6, 9, 12]);
    expect(next.paymentDay).toBe(15);
    expect(next.dueMonth).toBe(3);
    expect(next.categoryId).toBe('cat-abonnements');
  });

  it('keeps frequency monthly when paymentMonths is [1..12]', () => {
    const next = updateCharge(baseCharge, {
      paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    });
    expect(next.paymentMonths).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(next.dueMonth).toBe(1);
  });

  it('handles single-month paymentMonths (annual fixé)', () => {
    const next = updateCharge(baseCharge, { paymentMonths: [11] });
    expect(next.paymentMonths).toEqual([11]);
    expect(next.dueMonth).toBe(11);
  });
});
