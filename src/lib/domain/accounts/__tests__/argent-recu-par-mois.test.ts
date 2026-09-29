import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';

import { argentRecuParMois } from '@/lib/domain/accounts/argent-recu-par-mois';
import type { MovementRecord } from '@/lib/domain/accounts/operations-view';

/**
 * Tour 57 — « chaque centime doit pouvoir être retrouvé »: the money received
 * of past months, budget month by budget month, each total opening on its
 * lines (rule 10). Fictitious amounts.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const op = (over: Partial<MovementRecord> & { id: string }): MovementRecord => ({
  kind: 'income',
  fromAccountType: null,
  toAccountType: 'income_bills',
  amount: new Decimal(505),
  occurredOn: day('2026-07-03'),
  recordedAt: day('2026-07-03'),
  cancelledAt: null,
  planYear: null,
  planMonth: null,
  planSuggestedAmount: null,
  provisionPart: null,
  freeSavingsPart: null,
  incomeNature: 'regular',
  budgetYear: null,
  budgetMonth: null,
  description: 'Revenu du mois',
  ...over,
});

const journal: MovementRecord[] = [
  op({ id: 'juil-revenu', occurredOn: day('2026-07-03') }),
  op({
    id: 'juil-en-plus',
    occurredOn: day('2026-07-20'),
    amount: new Decimal(50),
    incomeNature: 'extra',
  }),
  // Received on 28 July FOR August: August's line, never July's.
  op({
    id: 'aout-revenu',
    occurredOn: day('2026-07-28'),
    budgetYear: 2026,
    budgetMonth: 8,
    amount: new Decimal(705),
  }),
  op({
    id: 'aout-annule',
    occurredOn: day('2026-08-10'),
    cancelledAt: day('2026-08-11'),
    amount: new Decimal(99),
  }),
  op({
    id: 'aout-carte',
    occurredOn: day('2026-08-12'),
    toAccountType: 'daily_card',
    amount: new Decimal(10.5),
  }),
  // A transfer is not money received.
  op({
    id: 'virement',
    kind: 'transfer',
    fromAccountType: 'income_bills',
    toAccountType: 'provisions',
    incomeNature: null,
    occurredOn: day('2026-08-05'),
  }),
  // The running month stays on the cards of the accounts.
  op({ id: 'sept-revenu', occurredOn: day('2026-09-01') }),
];

describe('argentRecuParMois', () => {
  const mois = argentRecuParMois(journal, '2026-09');

  it('lists the budget months before the given one, the most recent first', () => {
    expect(mois.map((m) => m.mois)).toEqual(['2026-08', '2026-07']);
  });

  it('ranges an income by the month it counts for, not by its date', () => {
    expect(mois[0]!.lignes.map((l) => l.id)).toContain('aout-revenu');
    expect(mois[1]!.lignes.map((l) => l.id)).not.toContain('aout-revenu');
  });

  it('the total is the sum of its standing lines; a cancelled line is listed, never counted', () => {
    const aout = mois[0]!;
    expect(aout.total.toFixed(2)).toBe('715.50');
    expect(aout.lignes.map((l) => l.id)).toEqual(['aout-carte', 'aout-annule', 'aout-revenu']);
    expect(aout.lignes.find((l) => l.id === 'aout-annule')!.cancelled).toBe(true);
    // Rule 10: the total is exactly what its standing lines add up to.
    const somme = aout.lignes
      .filter((l) => !l.cancelled)
      .reduce((s, l) => s.plus(l.amount), new Decimal(0));
    expect(somme.equals(aout.total)).toBe(true);
    expect(mois[1]!.total.toFixed(2)).toBe('555.00');
  });

  it('each line carries its account, its date and the month it counts for when the date does not say it', () => {
    const ligne = mois[0]!.lignes.find((l) => l.id === 'aout-revenu')!;
    expect(ligne).toMatchObject({ accountType: 'income_bills', countsFor: '2026-08' });
    expect(ligne.occurredOn.toISOString().slice(0, 10)).toBe('2026-07-28');
    expect(mois[0]!.lignes.find((l) => l.id === 'aout-carte')!.countsFor).toBeNull();
  });

  it('nothing received before: no month at all', () => {
    expect(argentRecuParMois(journal, '2026-07')).toEqual([]);
  });
});
