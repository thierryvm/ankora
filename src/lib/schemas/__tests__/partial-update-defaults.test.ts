import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { partialWithoutDefaults } from '../partial-update';
import { chargeInputSchema, chargeUpdateSchema } from '../charge';
import { commitmentInputSchema, commitmentUpdateSchema } from '../commitment';
import { expenseInputSchema, expenseUpdateSchema } from '../expense';
import { workspaceInputSchema, workspaceUpdateSchema } from '../workspace';

/**
 * An update schema describes a PATCH: what the caller sent, and nothing else.
 * Under Zod 4, `.partial()` keeps each field's `.default()`, so a key the
 * caller never sent came back out of the parse with its default value — and
 * every update action writes whatever is `!== undefined`. Editing a
 * commitment's label reset its day, frequency, category and note, and
 * re-activated it; editing a bill re-activated it; editing an expense moved it
 * back to the default account.
 *
 * Each case parses a one-field patch and asserts the output is EXACTLY that
 * one field (`toStrictEqual`, not `toMatchObject`, which is how the defaults
 * went unseen in the action tests).
 */
describe('update schemas never add a field the patch did not carry', () => {
  it('charge: a label-only patch does not bring back isActive', () => {
    const out = chargeUpdateSchema.parse({ label: 'Loyer' });
    expect(out).toStrictEqual({ label: 'Loyer' });
    expect(out).not.toHaveProperty('isActive');
  });

  it('commitment: a label-only patch does not bring back paymentDay, frequency, categoryId, notes, isActive', () => {
    const out = commitmentUpdateSchema.parse({ label: 'Crédit voiture' });
    expect(out).toStrictEqual({ label: 'Crédit voiture' });
    for (const key of ['paymentDay', 'frequency', 'categoryId', 'notes', 'isActive']) {
      expect(out).not.toHaveProperty(key);
    }
  });

  it('expense: a label-only patch does not bring back paidFrom', () => {
    const out = expenseUpdateSchema.parse({ label: 'Pharmacie' });
    expect(out).toStrictEqual({ label: 'Pharmacie' });
    expect(out).not.toHaveProperty('paidFrom');
  });

  it('workspace: a name-only patch does not bring back currency, fiscalMonthStart', () => {
    const out = workspaceUpdateSchema.parse({ name: 'Maison' });
    expect(out).toStrictEqual({ name: 'Maison' });
    expect(out).not.toHaveProperty('currency');
    expect(out).not.toHaveProperty('fiscalMonthStart');
  });

  it('an empty patch parses to an empty object on every update schema', () => {
    expect(chargeUpdateSchema.parse({})).toStrictEqual({});
    expect(commitmentUpdateSchema.parse({})).toStrictEqual({});
    expect(expenseUpdateSchema.parse({})).toStrictEqual({});
    expect(workspaceUpdateSchema.parse({})).toStrictEqual({});
  });
});

describe('an explicit value in a patch is kept as sent', () => {
  it('an explicit null still clears a commitment category and note', () => {
    expect(commitmentUpdateSchema.parse({ categoryId: null, notes: null })).toStrictEqual({
      categoryId: null,
      notes: null,
    });
  });

  it('an explicit null still clears a bill category and note', () => {
    expect(chargeUpdateSchema.parse({ categoryId: null, notes: null })).toStrictEqual({
      categoryId: null,
      notes: null,
    });
  });

  it('an explicit null still clears an expense note', () => {
    expect(expenseUpdateSchema.parse({ note: null })).toStrictEqual({ note: null });
  });

  it('an explicit isActive: false is not overwritten by the create default', () => {
    expect(chargeUpdateSchema.parse({ isActive: false })).toStrictEqual({ isActive: false });
    expect(commitmentUpdateSchema.parse({ isActive: false })).toStrictEqual({ isActive: false });
  });

  it('the update schemas still validate what they carry', () => {
    expect(chargeUpdateSchema.safeParse({ isActive: 'yes' }).success).toBe(false);
    expect(commitmentUpdateSchema.safeParse({ paymentDay: 32 }).success).toBe(false);
    expect(expenseUpdateSchema.safeParse({ paidFrom: 'nowhere' }).success).toBe(false);
    expect(expenseUpdateSchema.safeParse({ categoryId: null }).success).toBe(false);
    expect(workspaceUpdateSchema.safeParse({ fiscalMonthStart: 29 }).success).toBe(false);
  });
});

describe('partialWithoutDefaults', () => {
  it('drops .default() and .prefault() but keeps the inner validation', () => {
    const patch = partialWithoutDefaults(
      z.object({
        a: z.string().min(2).default('xx'),
        b: z.number().int().prefault(3),
        c: z.string().nullable().default(null),
      }),
    );
    expect(patch.parse({})).toStrictEqual({});
    expect(patch.parse({ c: null })).toStrictEqual({ c: null });
    expect(patch.safeParse({ a: 'x' }).success).toBe(false);
    expect(patch.safeParse({ b: 1.5 }).success).toBe(false);
  });

  it('refuses to build a patch schema whose default it cannot remove', () => {
    // A default hidden under another wrapper would still fill an absent key.
    expect(() =>
      partialWithoutDefaults(z.object({ a: z.string().default('x').nullable() })),
    ).toThrow(/empty patch must parse to \{\}/);
    expect(() =>
      partialWithoutDefaults(z.object({ a: z.string().default('x').optional() })),
    ).toThrow(/empty patch must parse to \{\}/);
  });

  it('keeps the source object config (a strict create schema gives a strict patch)', () => {
    const patch = partialWithoutDefaults(z.object({ a: z.string().default('x') }).strict());
    expect(patch.safeParse({ b: 1 }).success).toBe(false);
    expect(patch.parse({ a: 'y' })).toStrictEqual({ a: 'y' });
  });
});

describe('create schemas keep their defaults', () => {
  it('charge: isActive defaults to true on create', () => {
    const out = chargeInputSchema.parse({
      label: 'Loyer',
      amount: 505,
      frequency: 'monthly',
      dueMonth: 1,
      categoryId: null,
    });
    expect(out.isActive).toBe(true);
  });

  it('commitment: paymentDay, frequency, categoryId, notes, isActive default on create', () => {
    const out = commitmentInputSchema.parse({
      label: 'Crédit voiture',
      kind: 'debt',
      totalAmount: 705,
      installmentAmount: 505,
      installmentsTotal: 2,
      startYear: 2026,
      startMonth: 8,
    });
    expect(out).toMatchObject({
      paymentDay: 1,
      frequency: 'monthly',
      categoryId: null,
      notes: null,
      isActive: true,
    });
  });

  it('expense: paidFrom defaults to vie_courante on create', () => {
    const out = expenseInputSchema.parse({
      label: 'Pharmacie',
      amount: 12.5,
      occurredOn: '2026-09-01',
      categoryId: '5b2e9d10-4c7a-4f3e-8b6d-1a9c0e7f2d34',
      note: null,
    });
    expect(out.paidFrom).toBe('vie_courante');
  });

  it('workspace: currency and fiscalMonthStart default on create', () => {
    const out = workspaceInputSchema.parse({ name: 'Maison', monthlyIncome: null });
    expect(out).toMatchObject({ currency: 'EUR', fiscalMonthStart: 1 });
  });
});
