import { describe, expect, it } from 'vitest';

import {
  activeWorkspaces,
  brusselsDay,
  consentBreakdown,
  maskSmallCount,
  mondayOf,
  signupsByWeek,
  trailingWeeks,
} from '@/lib/admin/aggregates';

// Expectations changed on 2 October 2026 (security review): every shown count
// is now rounded to 5, because masking 1-4 alone let a masked cell be
// recovered by subtracting the exact ones.
describe('maskSmallCount', () => {
  it('hides 1 to 4 behind « < 5 », keeps 0, rounds the rest to 5', () => {
    expect(maskSmallCount(0)).toBe(0);
    for (const n of [1, 2, 3, 4]) expect(maskSmallCount(n)).toBe('< 5');
    expect(maskSmallCount(5)).toBe(5);
    expect(maskSmallCount(6)).toBe(5);
    expect(maskSmallCount(8)).toBe(10);
    expect(maskSmallCount(23)).toBe(25);
    expect(maskSmallCount(120)).toBe(120);
  });

  it('a masked consent cell can almost never be deduced from the shown ones', () => {
    // Brute force: for every true partition with a masked « refused », collect
    // every true value of « refused » that yields the SAME screen. One value
    // only would mean the screen gives it away.
    const screen = (g: number, r: number, n: number) =>
      JSON.stringify([maskSmallCount(g + r + n), consentBreakdown(g + r + n, g, r)]);
    const candidates = new Map<string, Set<number>>();
    const situations: string[] = [];
    for (let g = 0; g <= 40; g++) {
      for (let r = 1; r <= 4; r++) {
        for (let n = 0; n <= 40; n++) {
          const key = screen(g, r, n);
          situations.push(key);
          candidates.set(key, (candidates.get(key) ?? new Set()).add(r));
        }
      }
    }
    // The reviewer's case: total 30, granted 20, never chosen 7 → refused 3.
    const reviewerCase = candidates.get(screen(20, 3, 7));
    expect(reviewerCase?.size).toBeGreaterThan(1);
    // Residual, measured over every real situation (6 724 partitions): a few
    // still pin it, all with every true value at the very edge of its rounding
    // interval (7 + 4 + 7 = 18 shown as 20), or artefacts of this enumeration
    // stopping at 40. Zero would take random noise; a founder-only screen
    // accepts this. Before the fix, a third of the screens gave it away.
    const leaking = situations.filter((key) => candidates.get(key)?.size === 1);
    expect(leaking.length / situations.length).toBeLessThan(0.005);
  });
});

describe('week boundaries in Brussels', () => {
  it('reads the calendar day in Brussels, not in UTC', () => {
    // Summer time (UTC+2): 22:30 UTC on Sunday is already Monday 00:30 in Brussels.
    expect(brusselsDay(new Date('2026-09-27T22:30:00Z'))).toBe('2026-09-28');
    // Winter time (UTC+1): 22:30 UTC on Sunday is still Sunday 23:30 in Brussels.
    expect(brusselsDay(new Date('2026-11-29T22:30:00Z'))).toBe('2026-11-29');
  });

  it('a week starts on Monday', () => {
    expect(mondayOf('2026-10-02')).toBe('2026-09-28'); // Friday
    expect(mondayOf('2026-09-28')).toBe('2026-09-28'); // Monday
    expect(mondayOf('2026-10-04')).toBe('2026-09-28'); // Sunday
    expect(mondayOf('2026-03-01')).toBe('2026-02-23'); // across a month end
  });

  it('lists the trailing weeks, oldest first, ending with the current one', () => {
    const weeks = trailingWeeks('2026-10-02', 12);
    expect(weeks).toHaveLength(12);
    expect(weeks[11]).toBe('2026-09-28');
    expect(weeks[0]).toBe('2026-07-13');
  });

  it('files a sign-up just after midnight in Brussels under the NEW week', () => {
    const rows = [
      '2026-09-27T21:30:00Z', // Sunday 23:30 Brussels → week of 21 September
      '2026-09-27T22:30:00Z', // Monday 00:30 Brussels → week of 28 September
    ];
    const byWeek = signupsByWeek(rows, '2026-10-02', 2);
    expect(byWeek).toEqual([
      { week: '2026-09-21', signups: '< 5' },
      { week: '2026-09-28', signups: '< 5' },
    ]);
  });

  it('counts every sign-up of a week and ignores those before the window', () => {
    const rows = [
      ...Array.from({ length: 6 }, () => '2026-09-29T10:00:00Z'),
      '2026-01-05T10:00:00Z',
    ];
    expect(signupsByWeek(rows, '2026-10-02', 2)).toEqual([
      { week: '2026-09-21', signups: 0 },
      { week: '2026-09-28', signups: 5 },
    ]);
  });
});

describe('activeWorkspaces', () => {
  const now = new Date('2026-10-02T12:00:00Z');
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();

  it('counts DISTINCT workspaces per rolling window, ignoring rows without one', () => {
    const rows = [
      // 6 workspaces active in the last day, one of them twice
      ...['a', 'b', 'c', 'd', 'e', 'f'].map((w) => ({ workspace_id: w, occurred_at: at(2) })),
      { workspace_id: 'a', occurred_at: at(3) },
      // 2 more in the last week
      { workspace_id: 'g', occurred_at: at(24 * 3) },
      { workspace_id: 'h', occurred_at: at(24 * 6) },
      // 1 more in the last month
      { workspace_id: 'i', occurred_at: at(24 * 20) },
      // outside every window, and no workspace at all
      { workspace_id: 'j', occurred_at: at(24 * 40) },
      { workspace_id: null, occurred_at: at(1) },
    ];
    expect(activeWorkspaces(rows, now)).toEqual({ day1: 5, days7: 10, days30: 10 });
  });

  it('masks a small window', () => {
    expect(activeWorkspaces([{ workspace_id: 'a', occurred_at: at(1) }], now)).toEqual({
      day1: '< 5',
      days7: '< 5',
      days30: '< 5',
    });
  });
});

describe('consentBreakdown', () => {
  it('splits granted, refused and never chosen from the last state per person', () => {
    expect(consentBreakdown(20, 7, 5)).toEqual({ granted: 5, refused: 5, neverChosen: 10 });
  });

  it('never reports a negative « never chosen »', () => {
    expect(consentBreakdown(0, 1, 0)).toEqual({
      granted: '< 5',
      refused: 'hidden',
      neverChosen: 0,
    });
  });
});
