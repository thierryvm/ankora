import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';

import {
  ciblesDuGesteGroupe,
  dueDateIso,
  echeancesPassees,
  gesteGroupePour,
} from '../echeances-passees';
import type { MonthObligation } from '../types';

/**
 * FOURTEEN TICKS, ONE GESTURE.
 *
 * @thierry has 14 monthly charges and Ankora asks for 14 taps. The prototype
 * does it in one (`payPast`, l. 782). What it does NOT have is an undo — and a
 * bulk write without one is exactly the kind of gesture people learn to fear.
 *
 * So the same button does both, and which one it does is derived from the
 * state, never from a mode the user has to remember: everything past already
 * ticked ⇒ the press unticks. No confirmation dialog: a dialog in front of a
 * reversible action buys nothing and costs a tap every month.
 */

const REF = { year: 2026, month: 7 };

const o = (over: Partial<MonthObligation> = {}): MonthObligation => ({
  id: 'x',
  source: 'charge',
  label: 'Charge',
  amountDue: new Decimal(100),
  paymentDay: 5,
  isPaid: false,
  installmentIndex: null,
  installmentsTotal: null,
  ...over,
});

describe('what counts as past', () => {
  it('today counts as past — a bill due this morning is payable now', () => {
    expect(echeancesPassees([o({ paymentDay: 15 })], REF, '2026-07-15')).toHaveLength(1);
  });

  it('tomorrow does not', () => {
    expect(echeancesPassees([o({ paymentDay: 16 })], REF, '2026-07-15')).toHaveLength(0);
  });

  it('a month wholly in the past yields every occurrence', () => {
    const all = [o({ id: 'a', paymentDay: 1 }), o({ id: 'b', paymentDay: 28 })];
    expect(echeancesPassees(all, { year: 2026, month: 6 }, '2026-07-15')).toHaveLength(2);
  });

  it('day 31 in a 30-day month lands on the 30th, it does not roll forward', () => {
    expect(dueDateIso(31, { year: 2026, month: 6 })).toBe('2026-06-30');
    expect(dueDateIso(31, { year: 2026, month: 7 })).toBe('2026-07-31');
    expect(dueDateIso(29, { year: 2026, month: 2 })).toBe('2026-02-28');
  });
});

describe('one gesture, and the same gesture undoes it', () => {
  it('something unticked → the press ticks', () => {
    const passees = [o({ id: 'a', isPaid: true }), o({ id: 'b', isPaid: false })];
    expect(gesteGroupePour(passees)).toBe('pointer');
    // Already-ticked rows are left alone: pressing twice in a row is safe.
    expect(ciblesDuGesteGroupe(passees).map((x) => x.id)).toEqual(['b']);
  });

  it('everything ticked → the press unticks, all of it', () => {
    const passees = [o({ id: 'a', isPaid: true }), o({ id: 'b', isPaid: true })];
    expect(gesteGroupePour(passees)).toBe('depointer');
    expect(ciblesDuGesteGroupe(passees).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('ticking then pressing again returns exactly to the starting state', () => {
    const start = [o({ id: 'a', isPaid: false }), o({ id: 'b', isPaid: false })];
    const afterFirst = start.map((x) => ({ ...x, isPaid: true }));
    expect(gesteGroupePour(afterFirst)).toBe('depointer');
    const afterSecond = afterFirst.map((x) =>
      ciblesDuGesteGroupe(afterFirst).includes(x) ? { ...x, isPaid: false } : x,
    );
    expect(afterSecond.map((x) => x.isPaid)).toEqual([false, false]);
  });

  it('nothing past → nothing to offer, and the button hides rather than no-op', () => {
    expect(gesteGroupePour([])).toBe('rien');
    expect(ciblesDuGesteGroupe([])).toEqual([]);
  });

  it('acts on instalments and charges alike — that is the point of one list', () => {
    const passees = [
      o({ id: 'loyer', source: 'charge' }),
      o({ id: 'alpha', source: 'commitment', installmentIndex: 5, installmentsTotal: 35 }),
    ];
    expect(ciblesDuGesteGroupe(passees).map((x) => x.source)).toEqual(['charge', 'commitment']);
  });
});
