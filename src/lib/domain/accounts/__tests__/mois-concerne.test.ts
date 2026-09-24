import { describe, expect, it } from 'vitest';

import {
  choixDeMois,
  moisDeLaDate,
  moisProposePourArgentRecu,
  moisServisParRevenu,
  moisConcerneDe,
} from '../mois-concerne';

/**
 * The month an income counts for (tour 42, rule 3 of the plan): a salary
 * received on 28 September can be « for October ». The proposal is never read
 * from a fixed day of the month — the salary lands on the 26th, the 30th, or
 * the 2nd of the next month — but from the last month already served by a
 * « mon revenu du mois ».
 */
describe('moisProposePourArgentRecu', () => {
  const servisJusquaSeptembre = ['2026-08', '2026-09'];

  it.each(['2026-09-26', '2026-09-28', '2026-09-30'])(
    'proposes October for a regular income received on %s when September is already served',
    (dateIso) => {
      expect(
        moisProposePourArgentRecu({
          dateIso,
          nature: 'regular',
          moisServis: servisJusquaSeptembre,
        }),
      ).toBe('2026-10');
    },
  );

  it('keeps a late September salary, received on 2 October, for September', () => {
    expect(
      moisProposePourArgentRecu({
        dateIso: '2026-10-02',
        nature: 'regular',
        moisServis: ['2026-07', '2026-08'],
      }),
    ).toBe('2026-09');
  });

  it('proposes the month of the date when no income was ever received', () => {
    expect(
      moisProposePourArgentRecu({ dateIso: '2026-09-28', nature: 'regular', moisServis: [] }),
    ).toBe('2026-09');
  });

  it('proposes the month of the date for money received on top of the income', () => {
    expect(
      moisProposePourArgentRecu({
        dateIso: '2026-09-28',
        nature: 'extra',
        moisServis: servisJusquaSeptembre,
      }),
    ).toBe('2026-09');
  });

  it('falls back to the month of the date when the history is stale', () => {
    expect(
      moisProposePourArgentRecu({
        dateIso: '2026-09-15',
        nature: 'regular',
        moisServis: ['2026-05'],
      }),
    ).toBe('2026-09');
  });

  it('crosses the year: 30 December with December served proposes January', () => {
    expect(
      moisProposePourArgentRecu({
        dateIso: '2026-12-30',
        nature: 'regular',
        moisServis: ['2026-12'],
      }),
    ).toBe('2027-01');
  });

  it('does not re-propose a month already served: it goes one further, within the window', () => {
    expect(
      moisProposePourArgentRecu({
        dateIso: '2026-09-10',
        nature: 'regular',
        moisServis: ['2026-09'],
      }),
    ).toBe('2026-10');
  });
});

describe('moisServisParRevenu', () => {
  const base = {
    kind: 'income' as const,
    occurredOn: new Date('2026-08-28T00:00:00Z'),
    cancelledAt: null,
    incomeNature: 'regular' as const,
    budgetYear: null,
    budgetMonth: null,
  };

  it('reads the assigned month when there is one, the month of the date otherwise', () => {
    expect(
      moisServisParRevenu([
        base,
        {
          ...base,
          occurredOn: new Date('2026-09-28T00:00:00Z'),
          budgetYear: 2026,
          budgetMonth: 10,
        },
      ]),
    ).toEqual(['2026-08', '2026-10']);
  });

  it('ignores a cancelled income, money received on top, and transfers', () => {
    expect(
      moisServisParRevenu([
        { ...base, cancelledAt: new Date('2026-08-29T10:00:00Z') },
        { ...base, incomeNature: 'extra' },
        { ...base, kind: 'transfer', incomeNature: null },
      ]),
    ).toEqual([]);
  });
});

describe('moisConcerneDe', () => {
  it('is the month of the date without an assignment', () => {
    expect(
      moisConcerneDe({
        occurredOn: new Date('2026-09-28T00:00:00Z'),
        budgetYear: null,
        budgetMonth: null,
      }),
    ).toEqual({ year: 2026, month: 9 });
  });

  it('is the assigned month when there is one', () => {
    expect(
      moisConcerneDe({
        occurredOn: new Date('2026-09-28T00:00:00Z'),
        budgetYear: 2026,
        budgetMonth: 10,
      }),
    ).toEqual({ year: 2026, month: 10 });
  });
});

describe('choixDeMois', () => {
  it('offers the month of the date and the next one', () => {
    expect(choixDeMois({ dateIso: '2026-09-28', propose: '2026-10' })).toEqual([
      '2026-09',
      '2026-10',
    ]);
  });

  it('adds the previous month in front only when it is the proposal (late salary)', () => {
    expect(choixDeMois({ dateIso: '2026-10-02', propose: '2026-09' })).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
  });

  it('reads the month of an ISO day', () => {
    expect(moisDeLaDate('2026-12-31')).toBe('2026-12');
  });
});
