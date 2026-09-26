import { describe, expect, it } from 'vitest';

import {
  FUTURE_SPAN_MONTHS,
  PERIOD_FLOOR,
  isNextPeriod,
  isSamePeriod,
  parseViewedPeriod,
  periodOrdinal,
  shiftPeriod,
  toPeriodParam,
  transferPlanAllowed,
  viewedPeriodNav,
} from '../viewed-period';

/**
 * `?period=YYYY-MM` is user-controlled input, read by two screens (Bills and
 * the cockpit). One parser, so a month that Bills refuses the cockpit refuses
 * too — the two pages can never disagree on which months exist.
 */
const current = { year: 2026, month: 9 };

describe('parseViewedPeriod', () => {
  it('reads a valid month inside the window', () => {
    expect(parseViewedPeriod('2026-10', current)).toEqual({ year: 2026, month: 10 });
    expect(parseViewedPeriod('2026-02', current)).toEqual({ year: 2026, month: 2 });
  });

  it('falls back to the current month when absent', () => {
    expect(parseViewedPeriod(undefined, current)).toBe(current);
    expect(parseViewedPeriod('', current)).toBe(current);
  });

  it.each([['2026-13'], ['2026-00'], ['2026-9'], ['octobre'], ['2026-10-01'], [' 2026-10']])(
    'falls back to the current month on a malformed value %s',
    (raw) => {
      expect(parseViewedPeriod(raw, current)).toBe(current);
    },
  );

  it('accepts exactly twelve months ahead, refuses thirteen', () => {
    expect(FUTURE_SPAN_MONTHS).toBe(12);
    expect(parseViewedPeriod('2027-09', current)).toEqual({ year: 2027, month: 9 });
    expect(parseViewedPeriod('2027-10', current)).toBe(current);
  });

  it('accepts the floor month, refuses the month before it', () => {
    expect(PERIOD_FLOOR).toEqual({ year: 2026, month: 1 });
    expect(parseViewedPeriod('2026-01', current)).toEqual({ year: 2026, month: 1 });
    expect(parseViewedPeriod('2025-12', current)).toBe(current);
  });
});

describe('shiftPeriod / toPeriodParam / periodOrdinal', () => {
  it('wraps the year in both directions', () => {
    expect(shiftPeriod({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftPeriod({ year: 2027, month: 1 }, -1)).toEqual({ year: 2026, month: 12 });
  });

  it('writes a zero-padded parameter', () => {
    expect(toPeriodParam({ year: 2026, month: 3 })).toBe('2026-03');
  });

  it('orders months', () => {
    expect(periodOrdinal({ year: 2027, month: 1 })).toBeGreaterThan(
      periodOrdinal({ year: 2026, month: 12 }),
    );
  });
});

describe('isSamePeriod / isNextPeriod', () => {
  it('recognises the month right after the current one, across a year', () => {
    expect(isNextPeriod({ year: 2026, month: 10 }, current)).toBe(true);
    expect(isNextPeriod({ year: 2027, month: 1 }, { year: 2026, month: 12 })).toBe(true);
    expect(isNextPeriod({ year: 2026, month: 11 }, current)).toBe(false);
    expect(isNextPeriod(current, current)).toBe(false);
    expect(isNextPeriod({ year: 2026, month: 8 }, current)).toBe(false);
    expect(isSamePeriod({ year: 2026, month: 9 }, current)).toBe(true);
  });
});

describe('viewedPeriodNav', () => {
  it('offers both arrows inside the window', () => {
    expect(viewedPeriodNav({ year: 2026, month: 10 }, current)).toEqual({
      prevParam: '2026-09',
      nextParam: '2026-11',
      isCurrent: false,
    });
  });

  it('stops at the floor and at the horizon', () => {
    expect(viewedPeriodNav(PERIOD_FLOOR, current).prevParam).toBeNull();
    expect(viewedPeriodNav({ year: 2027, month: 9 }, current).nextParam).toBeNull();
    expect(viewedPeriodNav(current, current).isCurrent).toBe(true);
  });
});

describe('transferPlanAllowed', () => {
  it('allows the current month and the next one only', () => {
    expect(transferPlanAllowed(current, current)).toBe(true);
    expect(transferPlanAllowed({ year: 2026, month: 10 }, current)).toBe(true);
    expect(transferPlanAllowed({ year: 2027, month: 1 }, { year: 2026, month: 12 })).toBe(true);
    expect(transferPlanAllowed({ year: 2026, month: 11 }, current)).toBe(false);
    expect(transferPlanAllowed({ year: 2026, month: 8 }, current)).toBe(false);
  });
});
