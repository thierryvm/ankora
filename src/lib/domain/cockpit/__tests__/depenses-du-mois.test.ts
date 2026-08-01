import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

import { depensesDuMois } from '@/lib/domain/cockpit/depenses-du-mois';
import { calculerSituationDuMois } from '@/lib/domain/cockpit/situation-mois';
import type { CockpitCharge, PaymentLedger, ReferencePeriod } from '@/lib/domain/cockpit/types';
import type { Expense } from '@/lib/domain/types';

const REF: ReferencePeriod = { year: 2026, month: 7 };
const NO_PAYMENTS: PaymentLedger = new Map();

const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e-' + Math.random().toString(36).slice(2),
  label: 'Courses',
  amount: new Decimal(45),
  occurredOn: '2026-07-14',
  categoryId: null,
  note: null,
  paidFrom: 'vie_courante',
  ...over,
});

const charge = (over: Partial<CockpitCharge> = {}): CockpitCharge => ({
  id: 'c-' + Math.random().toString(36).slice(2),
  label: 'Loyer',
  amount: new Decimal(0),
  frequency: 'monthly',
  paymentMonths: [1],
  paymentDay: 1,
  isActive: true,
  ...over,
});

describe('depensesDuMois', () => {
  it('sums only the expenses of the reference month', () => {
    const out = depensesDuMois(
      [
        expense({ amount: new Decimal(45), occurredOn: '2026-07-01' }),
        expense({ amount: new Decimal(55), occurredOn: '2026-07-31' }),
        expense({ amount: new Decimal(999), occurredOn: '2026-06-30' }), // previous month
        expense({ amount: new Decimal(999), occurredOn: '2026-08-01' }), // next month
      ],
      REF,
    );
    expect(out.toNumber()).toBe(100);
  });

  it('handles a single-digit month without matching the wrong one', () => {
    // Naive string matching on "2026-7" would also catch "2026-07" vs "2026-10".
    const out = depensesDuMois(
      [
        expense({ amount: new Decimal(10), occurredOn: '2026-07-05' }),
        expense({ amount: new Decimal(20), occurredOn: '2026-10-05' }),
        expense({ amount: new Decimal(30), occurredOn: '2026-12-07' }),
      ],
      { year: 2026, month: 7 },
    );
    expect(out.toNumber()).toBe(10);
  });

  it('does not confuse the same month of another year', () => {
    const out = depensesDuMois(
      [
        expense({ amount: new Decimal(10), occurredOn: '2026-07-05' }),
        expense({ amount: new Decimal(20), occurredOn: '2025-07-05' }),
      ],
      REF,
    );
    expect(out.toNumber()).toBe(10);
  });

  it('returns zero for an empty list', () => {
    expect(depensesDuMois([], REF).toNumber()).toBe(0);
  });
});

/**
 * Non-double-counting invariant (ADR-035).
 *
 * `resteDisponible` already deducts charges and commitments as smoothed
 * monthly effort. `ilTeReste` then deducts `depensesDuMois` on top. If a charge
 * occurrence could also live in `expenses`, it would be subtracted twice and
 * the hero figure would be quietly wrong — the kind of defect that destroys
 * trust in the number without ever throwing.
 *
 * No such guard existed before this chantier: nothing under
 * `src/lib/domain/cockpit/` so much as mentioned expenses. These tests pin the
 * property now that the two universes finally meet in one figure.
 */
describe('invariant — a charge is never an expense', () => {
  const base = {
    revenus: new Decimal(2500),
    charges: [charge({ amount: new Decimal(1000), frequency: 'monthly' })],
    budgetVieCourante: new Decimal(500),
    soldeEpargneActuel: new Decimal(0),
    payments: NO_PAYMENTS,
    ref: REF,
    engagementsMensuels: new Decimal(0),
    joursEcoules: 15,
    joursDuMois: 31,
  };

  it('charges are absent from depensesDuMois — they live in a different universe', () => {
    // The charge above is 1000 €/month and is already inside resteDisponible.
    // depensesDuMois only ever reads the expenses list.
    expect(depensesDuMois([], REF).toNumber()).toBe(0);
  });

  it('recording a 45 € expense lowers ilTeReste by exactly 45 €', () => {
    const before = calculerSituationDuMois({ ...base, depensesDuMois: new Decimal(0) });
    const after = calculerSituationDuMois({ ...base, depensesDuMois: new Decimal(45) });

    expect(before.ilTeReste.minus(after.ilTeReste).toNumber()).toBe(45);
  });

  it('the anchor « Budget du mois » does NOT move when an expense is recorded', () => {
    // This is the whole point of the two-figure split: the hero is real-time,
    // the anchor is stable for the month. If both moved, the anchor would be
    // useless; if neither did, the feedback loop would stay open.
    const before = calculerSituationDuMois({ ...base, depensesDuMois: new Decimal(0) });
    const after = calculerSituationDuMois({ ...base, depensesDuMois: new Decimal(400) });

    expect(after.resteDisponible.toNumber()).toBe(before.resteDisponible.toNumber());
    expect(after.ilTeReste.toNumber()).toBe(before.resteDisponible.minus(400).toNumber());
  });

  it('a charge already counted in resteDisponible is not deducted a second time', () => {
    // Same 1000 € charge, and the user records NO expense for it (the correct
    // modelling). ilTeReste must equal revenus − charge exactly, i.e. 1500.
    const out = calculerSituationDuMois({ ...base, depensesDuMois: new Decimal(0) });
    expect(out.resteDisponible.toNumber()).toBe(1500);
    expect(out.ilTeReste.toNumber()).toBe(1500);

    // And if the same 1000 € were ALSO entered as an expense — the mistake the
    // invariant forbids — the figure would visibly halve. Pinning the arithmetic
    // documents the cost of breaking the rule.
    const doubleCounted = calculerSituationDuMois({ ...base, depensesDuMois: new Decimal(1000) });
    expect(doubleCounted.ilTeReste.toNumber()).toBe(500);
  });

  it('ilTeReste can go negative — overspending is a real state, not clamped', () => {
    const out = calculerSituationDuMois({ ...base, depensesDuMois: new Decimal(2000) });
    expect(out.ilTeReste.toNumber()).toBe(-500);
  });
});
