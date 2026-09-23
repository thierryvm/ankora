import { describe, expect, it } from 'vitest';

import { currentMonthWithEarlier } from '../expenses/month-with-earlier';

/**
 * The expense list = the current month COMPLETE + earlier rows from a capped read.
 *
 * The current month is grouped by description and those groups decompose the
 * month total (rule 10). That total is summed from the complete read; if any
 * current-month row came from the capped read instead, the groups and the total
 * would describe two different sets of rows. So the current month has exactly
 * one source, and the capped read only ever supplies OTHER months.
 */

type Row = { id: string; occurredOn: string };

const SEPTEMBER = { year: 2026, month: 9 };

function rows(prefix: string, count: number, date: (i: number) => string): Row[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}`, occurredOn: date(i) }));
}

const day = (i: number) => `2026-09-${String((i % 28) + 1).padStart(2, '0')}`;

describe('currentMonthWithEarlier', () => {
  it('keeps all 60 rows of the current month, beyond the 50-row cap', () => {
    const month = rows('month', 60, day);
    const earlier = rows('aug', 5, (i) => `2026-08-${String(20 + i).padStart(2, '0')}`);
    // The capped read: its 45 newest rows are in September, then 5 in August.
    const capped = [...rows('capped-sep', 45, day), ...earlier];

    const result = currentMonthWithEarlier(month, capped, SEPTEMBER);

    const september = result.filter((r) => r.occurredOn.startsWith('2026-09'));
    expect(september).toHaveLength(60);
    // Every current-month row is one of the complete read's own objects.
    for (const r of september) expect(month).toContain(r);
    for (const r of earlier) expect(result).toContain(r);
    expect(result).toHaveLength(65);
  });

  it('takes no current-month row from the capped read, even one the complete read lacks', () => {
    // A row can sit in one read and not the other — inserted or re-dated
    // between the two. The complete read is the one the total is summed from,
    // so a stray current-month row from the capped read would break rule 10.
    const month = [{ id: 'a', occurredOn: '2026-09-03' }];
    const capped = [
      { id: 'a', occurredOn: '2026-09-03' },
      { id: 'stray', occurredOn: '2026-09-04' },
      { id: 'old', occurredOn: '2026-08-31' },
    ];

    const result = currentMonthWithEarlier(month, capped, SEPTEMBER);

    expect(result.map((r) => r.id)).toEqual(['a', 'old']);
    expect(result[0]).toBe(month[0]);
  });

  it('pads the month, and keeps the same month of another year as earlier', () => {
    const result = currentMonthWithEarlier(
      [],
      [
        { id: 'this', occurredOn: '2026-09-01' },
        { id: 'last-year', occurredOn: '2025-09-15' },
        { id: 'january', occurredOn: '2026-01-09' },
      ],
      SEPTEMBER,
    );

    expect(result.map((r) => r.id)).toEqual(['last-year', 'january']);
  });

  it('puts the current month first, then the earlier rows in their incoming order', () => {
    const month = [
      { id: 'm1', occurredOn: '2026-09-10' },
      { id: 'm2', occurredOn: '2026-09-02' },
    ];
    const capped = [
      { id: 'e1', occurredOn: '2026-08-30' },
      { id: 'e2', occurredOn: '2026-07-01' },
    ];

    expect(currentMonthWithEarlier(month, capped, SEPTEMBER).map((r) => r.id)).toEqual([
      'm1',
      'm2',
      'e1',
      'e2',
    ]);
  });

  it('returns an empty list for two empty reads', () => {
    expect(currentMonthWithEarlier([], [], SEPTEMBER)).toEqual([]);
  });
});
