import { describe, it, expect } from 'vitest';

import { money } from '@/lib/domain/types';
import { updateExpense, validateExpenseUpdate } from '../update';
import type { ExpenseRecord } from '../types';

const TODAY = '2026-05-07';

const baseExpense: ExpenseRecord = Object.freeze({
  id: 'exp-1',
  workspaceId: 'ws-1',
  label: 'Course',
  amount: money('45.20'),
  occurredOn: '2026-05-05',
  categoryId: null,
  note: null,
  paidFrom: 'vie_courante',
});

describe('validateExpenseUpdate', () => {
  it('accepts an empty update', () => {
    expect(validateExpenseUpdate({}, TODAY)).toEqual({ ok: true });
  });

  it('rejects empty label', () => {
    const r = validateExpenseUpdate({ label: '   ' }, TODAY);
    expect(r).toEqual({ ok: false, errors: { label: ['expense.label.required'] } });
  });

  it('rejects label too long', () => {
    expect(validateExpenseUpdate({ label: 'x'.repeat(121) }, TODAY).ok).toBe(false);
  });

  it('rejects negative amount', () => {
    expect(validateExpenseUpdate({ amount: money('-1') }, TODAY).ok).toBe(false);
  });

  it('rejects amount > 1_000_000', () => {
    expect(validateExpenseUpdate({ amount: money('1000001') }, TODAY).ok).toBe(false);
  });

  it('accepts amount 0', () => {
    expect(validateExpenseUpdate({ amount: money('0') }, TODAY)).toEqual({ ok: true });
  });

  it('rejects malformed date (regex fail)', () => {
    expect(validateExpenseUpdate({ occurredOn: '07-05-2026' }, TODAY).ok).toBe(false);
    expect(validateExpenseUpdate({ occurredOn: '2026/05/07' }, TODAY).ok).toBe(false);
  });

  it('rejects future date', () => {
    expect(validateExpenseUpdate({ occurredOn: '2026-05-08' }, TODAY).ok).toBe(false);
  });

  it('accepts today as occurredOn', () => {
    expect(validateExpenseUpdate({ occurredOn: TODAY }, TODAY)).toEqual({ ok: true });
  });

  it('rejects calendar-invalid date (Feb 30)', () => {
    expect(validateExpenseUpdate({ occurredOn: '2026-02-30' }, TODAY).ok).toBe(false);
  });

  it('rejects April 31', () => {
    expect(validateExpenseUpdate({ occurredOn: '2026-04-31' }, TODAY).ok).toBe(false);
  });

  it('accepts February 29 in leap year (2024)', () => {
    expect(validateExpenseUpdate({ occurredOn: '2024-02-29' }, TODAY)).toEqual({ ok: true });
  });

  it('rejects February 29 in non-leap year (2023)', () => {
    expect(validateExpenseUpdate({ occurredOn: '2023-02-29' }, TODAY).ok).toBe(false);
  });

  it('rejects note > 500 chars', () => {
    expect(validateExpenseUpdate({ note: 'x'.repeat(501) }, TODAY).ok).toBe(false);
  });
});

describe('updateExpense', () => {
  it('returns equal record on empty update', () => {
    expect(updateExpense(baseExpense, {}, TODAY)).toEqual(baseExpense);
  });

  it('trims label', () => {
    const next = updateExpense(baseExpense, { label: '  Pharmacie  ' }, TODAY);
    expect(next.label).toBe('Pharmacie');
  });

  it('updates amount with Decimal precision', () => {
    const next = updateExpense(baseExpense, { amount: money('99.999') }, TODAY);
    expect(next.amount.toString()).toBe('99.999');
  });

  it('updates occurredOn (past date OK)', () => {
    const next = updateExpense(baseExpense, { occurredOn: '2026-05-01' }, TODAY);
    expect(next.occurredOn).toBe('2026-05-01');
  });

  it('throws on future occurredOn', () => {
    expect(() => updateExpense(baseExpense, { occurredOn: '2026-12-31' }, TODAY)).toThrow();
  });

  it('sets categoryId to null', () => {
    const e = { ...baseExpense, categoryId: 'cat-1' };
    const next = updateExpense(e, { categoryId: null }, TODAY);
    expect(next.categoryId).toBeNull();
  });

  it('normalizes empty note to null', () => {
    const e: ExpenseRecord = { ...baseExpense, note: 'something' };
    const next = updateExpense(e, { note: '' }, TODAY);
    expect(next.note).toBeNull();
  });

  it('preserves note when undefined', () => {
    const e: ExpenseRecord = { ...baseExpense, note: 'keep me' };
    const next = updateExpense(e, { label: 'X' }, TODAY);
    expect(next.note).toBe('keep me');
  });

  it('updates paidFrom to principal', () => {
    const next = updateExpense(baseExpense, { paidFrom: 'principal' }, TODAY);
    expect(next.paidFrom).toBe('principal');
  });

  it('updates paidFrom to epargne', () => {
    const next = updateExpense(baseExpense, { paidFrom: 'epargne' }, TODAY);
    expect(next.paidFrom).toBe('epargne');
  });

  it('preserves id and workspaceId', () => {
    const next = updateExpense(baseExpense, { label: 'X' }, TODAY);
    expect(next.id).toBe(baseExpense.id);
    expect(next.workspaceId).toBe(baseExpense.workspaceId);
  });

  it('handles multiple field updates atomically', () => {
    const next = updateExpense(
      baseExpense,
      {
        label: 'Restaurant',
        amount: money('32.50'),
        occurredOn: '2026-05-06',
        categoryId: 'cat-resto',
        note: 'avec amis',
      },
      TODAY,
    );
    expect(next).toMatchObject({
      label: 'Restaurant',
      occurredOn: '2026-05-06',
      categoryId: 'cat-resto',
      note: 'avec amis',
    });
    expect(next.amount.toString()).toBe('32.5');
  });

  it('does not mutate the input', () => {
    updateExpense(baseExpense, { label: 'New' }, TODAY);
    expect(baseExpense.label).toBe('Course');
  });
});
