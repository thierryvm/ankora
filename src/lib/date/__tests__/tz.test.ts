import { describe, expect, it } from 'vitest';

import { ANKORA_TIMEZONE, dayOffsetFrom } from '../tz';

/**
 * `dayOffsetFrom` decides whether the entry sheet shows « Aujourd'hui » or a
 * bare date, so a wrong answer is visible on the most frequent action in the
 * app. The cases below are mostly about the two ways date arithmetic goes wrong:
 * local midnight, and half-typed input.
 */

describe('ANKORA_TIMEZONE', () => {
  it('is Europe/Brussels — every boundary in the app depends on it', () => {
    expect(ANKORA_TIMEZONE).toBe('Europe/Brussels');
  });
});

describe('dayOffsetFrom', () => {
  it.each([
    ['2026-07-29', '2026-07-29', 0],
    ['2026-07-29', '2026-07-28', -1],
    ['2026-07-29', '2026-07-30', 1],
    ['2026-07-29', '2026-07-22', -7],
  ])('from %s to %s is %s', (today, date, expected) => {
    expect(dayOffsetFrom(today, date)).toBe(expected);
  });

  it('crosses a month boundary', () => {
    expect(dayOffsetFrom('2026-08-01', '2026-07-31')).toBe(-1);
  });

  it('crosses a year boundary', () => {
    expect(dayOffsetFrom('2026-01-01', '2025-12-31')).toBe(-1);
  });

  it('handles a leap day', () => {
    expect(dayOffsetFrom('2028-03-01', '2028-02-29')).toBe(-1);
  });

  /**
   * The DST trap. On the Belgian spring-forward night the local day is 23 hours
   * long, so a millisecond difference divided by 86 400 000 gives 0.958 — which
   * `Math.floor` would read as 0 days and label yesterday « Aujourd'hui ».
   * Building both stamps through `Date.UTC` means the arithmetic never meets a
   * local midnight in the first place.
   */
  it('survives the spring-forward night (2026-03-29 in Belgium)', () => {
    expect(dayOffsetFrom('2026-03-29', '2026-03-28')).toBe(-1);
    expect(dayOffsetFrom('2026-03-30', '2026-03-29')).toBe(-1);
  });

  it('survives the autumn fall-back night (2026-10-25 in Belgium)', () => {
    expect(dayOffsetFrom('2026-10-25', '2026-10-24')).toBe(-1);
    expect(dayOffsetFrom('2026-10-26', '2026-10-25')).toBe(-1);
  });

  it.each(['', '2026-07', '2026-7-29', 'today', '29/07/2026', '2026-07-29T10:00:00Z'])(
    'returns null for %s rather than a NaN offset',
    (bad) => {
      // A date input produces a partial value on nearly every keystroke; a NaN
      // reaching the UI would render as a label nobody can read.
      expect(dayOffsetFrom('2026-07-29', bad)).toBeNull();
      expect(dayOffsetFrom(bad, '2026-07-29')).toBeNull();
    },
  );
});
