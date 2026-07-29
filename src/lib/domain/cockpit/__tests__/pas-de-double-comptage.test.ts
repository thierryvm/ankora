import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';

import { calculerSituationDuMois } from '../situation-mois';
import { depensesDuMois } from '../depenses-du-mois';
import { paymentKey, type CockpitCharge, type PaymentLedger, type ReferencePeriod } from '../types';
import { isSelectableForExpense } from '@/lib/domain/categories';
import { money, type Expense } from '@/lib/domain/types';

/**
 * THE DOUBLE-COUNTING TRAP — ADR-035 §5, locked here.
 *
 * ## What could go wrong, in the user's words
 *
 * The car insurance is 150 €/quarter. Ankora already deducts 50 €/month of it
 * from « Budget du mois » as a smoothed provision — that is the whole point of
 * `provisionsLissees`. On the 12th, the bill is paid, and the user does the
 * thing that feels responsible: they tick it off in Factures, *and* they record
 * a 150 € expense, because they did just spend 150 €.
 *
 * If both count, « Il te reste » drops by 150 € for money the app had already
 * set aside. The number is wrong, it is wrong in the direction that makes the
 * user think they have less than they do, and — this is the part that matters —
 * **nothing on screen explains why**. They would conclude the app cannot count.
 *
 * ## Why the risk is NEW as of ADR-035
 *
 * Before it, `resteDisponible` ignored `expenses` entirely: the two universes
 * could not collide because they never met. `ilTeReste = resteDisponible −
 * depensesDuMois` is the first figure in this codebase that combines smoothed
 * bills with raw expenses. The invariant existed implicitly and cost nothing;
 * from now on it is load-bearing.
 *
 * ## The invariant
 *
 * > A `charge` or `commitment` occurrence is NEVER an `expense`. The two
 * > universes are disjoint. `expenses` holds only variable, hand-entered
 * > spending.
 *
 * ## What this file asserts, and what it deliberately does not
 *
 * The three properties below are what the money math can be held to:
 *
 *   1. ticking a bill as paid moves NO expense figure;
 *   2. `depensesDuMois` reads `expenses` and nothing else — no ledger, no
 *      charge, no commitment can enter it;
 *   3. the interface cannot invite the violation (bill categories are not
 *      offered in the expense picker).
 *
 * What no unit test can prevent is a user typing « Assurance auto · 150 € » by
 * hand into a *variable* category. That is why property 3 exists — the
 * structural half — and why the entry sheet shows « Il te restera X € » before
 * the user commits: the consequence is visible at the moment of the decision.
 * Stated plainly rather than papered over.
 */

const REF: ReferencePeriod = { year: 2026, month: 7 };
const CHARGE_ID = 'charge-assurance-auto';

const charge = (over: Partial<CockpitCharge> = {}): CockpitCharge => ({
  id: CHARGE_ID,
  label: 'Assurance auto',
  amount: new Decimal(150),
  frequency: 'quarterly',
  paymentMonths: [1, 4, 7, 10],
  paymentDay: 12,
  isActive: true,
  ...over,
});

const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'exp-1',
  label: 'Courses',
  amount: money(60),
  occurredOn: '2026-07-15',
  categoryId: 'cat-courses',
  note: null,
  paidFrom: 'vie_courante',
  ...over,
});

/** Same inputs twice, once with the July occurrence ticked as paid. */
function situation(payments: PaymentLedger, expenses: readonly Expense[]) {
  return calculerSituationDuMois({
    revenus: new Decimal(2600),
    charges: [
      charge(),
      charge({
        id: 'charge-loyer',
        label: 'Loyer',
        amount: new Decimal(1000),
        frequency: 'monthly',
        paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      }),
    ],
    soldeEpargneActuel: new Decimal(5000),
    payments,
    ref: REF,
    engagementsMensuels: new Decimal(470),
    depensesDuMois: depensesDuMois(expenses, REF),
    joursEcoules: 15,
    joursDuMois: 31,
  });
}

describe('a settled bill is never also an expense', () => {
  const unpaid: PaymentLedger = new Map();
  const paid: PaymentLedger = new Map([[paymentKey(CHARGE_ID, 2026, 7), true]]);
  const groceries = [expense()];

  it('ticking the bill as paid does not move « Dépensé ce mois »', () => {
    expect(situation(paid, groceries).depensesDuMois.toNumber()).toBe(
      situation(unpaid, groceries).depensesDuMois.toNumber(),
    );
    expect(situation(paid, groceries).depensesDuMois.toNumber()).toBe(60);
  });

  it('ticking the bill as paid does not move « Il te reste »', () => {
    // The bill was already deducted as a smoothed provision. Settling it is a
    // cash movement between the user's own accounts, not new consumption.
    expect(situation(paid, groceries).ilTeReste.toNumber()).toBe(
      situation(unpaid, groceries).ilTeReste.toNumber(),
    );
  });

  it('deducts the quarterly bill exactly once, as 50 €/month of provision', () => {
    const out = situation(paid, []);
    // 150 € / 3 months = 50 €. If the settled occurrence ALSO entered
    // `depensesDuMois`, `ilTeReste` would be 150 € lower than this.
    expect(out.provisionsLissees.toNumber()).toBe(50);
    expect(out.chargesFixes.toNumber()).toBe(1000);
    // 2600 − 1000 (loyer) − 50 (provision) − 470 (engagements) = 1080
    expect(out.resteDisponible.toNumber()).toBe(1080);
    expect(out.ilTeReste.toNumber()).toBe(1080);
  });

  it('the only thing that moves « Il te reste » is a hand-entered expense', () => {
    const before = situation(paid, []).ilTeReste;
    const after = situation(paid, [expense({ amount: money(45) })]).ilTeReste;
    expect(before.minus(after).toNumber()).toBe(45);
  });
});

describe('depensesDuMois reads `expenses` and nothing else', () => {
  it('is blind to the payment ledger', () => {
    // The signature is the guarantee: no PaymentLedger, no charge, no
    // commitment can reach this function. A future refactor that widened it
    // would have to change this call site, which is the point.
    const total = depensesDuMois([expense({ amount: money(20) })], REF);
    expect(total.toNumber()).toBe(20);
  });

  it('ignores an expense outside the reference month', () => {
    const total = depensesDuMois(
      [
        expense({ id: 'a', amount: money(20), occurredOn: '2026-07-31' }),
        expense({ id: 'b', amount: money(999), occurredOn: '2026-06-30' }),
        expense({ id: 'c', amount: money(999), occurredOn: '2026-08-01' }),
      ],
      REF,
    );
    expect(total.toNumber()).toBe(20);
  });

  it('would surface the double count if one ever slipped in — the test is not vacuous', () => {
    // The failure mode, written out: a 150 € expense mirroring the settled
    // bill. `depensesDuMois` counts it, because it cannot tell. Nothing here
    // is asserting "it is impossible"; the guarantee is upstream, and this
    // case exists so nobody mistakes the two.
    const mirrored = depensesDuMois(
      [expense({ id: 'mirror', label: 'Assurance auto', amount: money(150) })],
      REF,
    );
    expect(mirrored.toNumber()).toBe(150);
  });
});

describe('the interface cannot invite the violation', () => {
  it('never offers a bill category in the expense picker', () => {
    // The structural half of the invariant. The user is not asked to remember
    // the rule; the option is simply not there. Full ordering and overflow
    // behaviour live in `categories/__tests__/expense-categories.test.ts`.
    expect(
      isSelectableForExpense({
        id: 'cat-assurances',
        name: 'Assurances',
        kind: 'fixed',
        colorToken: 'amber',
        isSystem: false,
      }),
    ).toBe(false);
  });
});
