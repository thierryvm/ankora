import { describe, expect, it } from 'vitest';

import {
  depensesDuMoisDeBudget,
  fenetreDuMoisDeBudget,
  moisDeBudgetDe,
  moisDeBudgetEnCours,
  type RevenuDuJournal,
} from '../mois-de-budget';

/**
 * ADR-047 — the budget month starts when the money received « for » it lands.
 * Fictitious amounts only (public repository).
 */

const revenu = (
  occurredOn: string,
  recordedAt: string,
  budget: { year: number; month: number } | null,
  extra: Partial<RevenuDuJournal> = {},
): RevenuDuJournal => ({
  kind: 'income',
  occurredOn: new Date(`${occurredOn}T00:00:00Z`),
  recordedAt: new Date(recordedAt),
  cancelledAt: null,
  incomeNature: 'regular',
  budgetYear: budget?.year ?? null,
  budgetMonth: budget?.month ?? null,
  ...extra,
});

const depense = (occurredOn: string, createdAt?: string) => ({
  occurredOn,
  ...(createdAt ? { createdAt } : {}),
});

const OCT = { year: 2026, month: 10 };
const SEPT = { year: 2026, month: 9 };
// The salary « for October », arrived on 28 September, written at 18:00 UTC.
const SALAIRE_OCTOBRE = revenu('2026-09-28', '2026-09-28T18:00:00Z', OCT);

describe('moisDeBudgetDe', () => {
  it('an expense of 29 September after the income « for October » of 28 September → October', () => {
    expect(moisDeBudgetDe(depense('2026-09-29'), [SALAIRE_OCTOBRE])).toEqual(OCT);
  });

  it('without October income written → September (the calendar)', () => {
    expect(moisDeBudgetDe(depense('2026-09-29'), [])).toEqual(SEPT);
  });

  it('same day: written BEFORE the income → September, AFTER → October', () => {
    expect(
      moisDeBudgetDe(depense('2026-09-28', '2026-09-28T09:00:00Z'), [SALAIRE_OCTOBRE]),
    ).toEqual(SEPT);
    expect(
      moisDeBudgetDe(depense('2026-09-28', '2026-09-28T20:00:00Z'), [SALAIRE_OCTOBRE]),
    ).toEqual(OCT);
  });

  it('a corrected income date moves the ranging with it (a calculation, not stored)', () => {
    const redate = revenu('2026-09-30', '2026-09-28T18:00:00Z', OCT);
    expect(moisDeBudgetDe(depense('2026-09-29'), [redate])).toEqual(SEPT);
    expect(moisDeBudgetDe(depense('2026-09-30', '2026-09-30T20:00:00Z'), [redate])).toEqual(OCT);
  });

  it('money received on top (« extra ») moves nothing', () => {
    const enPlus = revenu('2026-09-28', '2026-09-28T18:00:00Z', null, { incomeNature: 'extra' });
    expect(moisDeBudgetDe(depense('2026-09-29'), [enPlus])).toEqual(SEPT);
  });

  it('a cancelled income moves nothing', () => {
    const annule = { ...SALAIRE_OCTOBRE, cancelledAt: new Date('2026-09-28T19:00:00Z') };
    expect(moisDeBudgetDe(depense('2026-09-29'), [annule])).toEqual(SEPT);
  });

  it('December → January across the year', () => {
    const janvier = revenu('2026-12-28', '2026-12-28T08:00:00Z', { year: 2027, month: 1 });
    expect(moisDeBudgetDe(depense('2026-12-30'), [janvier])).toEqual({ year: 2027, month: 1 });
  });

  it('a late salary « for September » received on 2 October leaves October expenses in October', () => {
    const tardif = revenu('2026-10-02', '2026-10-02T08:00:00Z', SEPT);
    expect(moisDeBudgetDe(depense('2026-10-05'), [tardif])).toEqual(OCT);
  });

  it('once the next month has begun on the calendar, the calendar takes over again', () => {
    expect(moisDeBudgetDe(depense('2026-10-15'), [SALAIRE_OCTOBRE])).toEqual(OCT);
    expect(moisDeBudgetDe(depense('2026-11-02'), [SALAIRE_OCTOBRE])).toEqual({
      year: 2026,
      month: 11,
    });
  });
});

describe('depensesDuMoisDeBudget', () => {
  const liste = [
    depense('2026-09-20'),
    depense('2026-09-28', '2026-09-28T09:00:00Z'),
    depense('2026-09-28', '2026-09-28T20:00:00Z'),
    depense('2026-09-29'),
    depense('2026-10-03'),
  ];
  it('splits the same list between the two months without losing or doubling a line', () => {
    const sept = depensesDuMoisDeBudget(liste, SEPT, [SALAIRE_OCTOBRE]);
    const oct = depensesDuMoisDeBudget(liste, OCT, [SALAIRE_OCTOBRE]);
    expect(sept.map((d) => d.occurredOn)).toEqual(['2026-09-20', '2026-09-28']);
    expect(oct.map((d) => d.occurredOn)).toEqual(['2026-09-28', '2026-09-29', '2026-10-03']);
    expect(sept.length + oct.length).toBe(liste.length);
  });
  it('without income: the calendar month, exactly as before', () => {
    expect(depensesDuMoisDeBudget(liste, SEPT, []).length).toBe(4);
  });
});

describe('fenetreDuMoisDeBudget', () => {
  // Tour 57 (Reviewer, tour 49) — two month incomes for the same month: the
  // first to arrive opens it, whatever the order they were written in.
  it('the first of two incomes for October opens October', () => {
    const second = {
      ...SALAIRE_OCTOBRE,
      occurredOn: new Date('2026-09-30T00:00:00Z'),
      recordedAt: new Date('2026-09-26T08:00:00Z'),
    };
    const premier = {
      ...SALAIRE_OCTOBRE,
      occurredOn: new Date('2026-09-25T00:00:00Z'),
      recordedAt: new Date('2026-09-30T08:00:00Z'),
    };
    expect(fenetreDuMoisDeBudget(OCT, [second, premier]).debut).toBe('2026-09-25');
    expect(fenetreDuMoisDeBudget(SEPT, [second, premier]).fin).toBe('2026-09-24');
  });
  it('October runs from the salary day to the end of October while November is not written', () => {
    expect(fenetreDuMoisDeBudget(OCT, [SALAIRE_OCTOBRE])).toEqual({
      debut: '2026-09-28',
      fin: '2026-10-31',
      jours: 34,
      calendaire: false,
    });
  });
  it('September ends the day before the October salary', () => {
    expect(fenetreDuMoisDeBudget(SEPT, [SALAIRE_OCTOBRE])).toEqual({
      debut: '2026-09-01',
      fin: '2026-09-27',
      jours: 27,
      calendaire: false,
    });
  });
  it('no income: the calendar month', () => {
    expect(fenetreDuMoisDeBudget(SEPT, [])).toEqual({
      debut: '2026-09-01',
      fin: '2026-09-30',
      jours: 30,
      calendaire: true,
    });
  });
});

describe('moisDeBudgetEnCours', () => {
  it('28 September in the evening, October salary written → October', () => {
    expect(
      moisDeBudgetEnCours([SALAIRE_OCTOBRE], '2026-09-28', new Date('2026-09-28T20:00:00Z')),
    ).toEqual(OCT);
  });
  it('28 September in the morning, salary not written yet → September', () => {
    expect(moisDeBudgetEnCours([], '2026-09-28', new Date('2026-09-28T08:00:00Z'))).toEqual(SEPT);
  });
});
