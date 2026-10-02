import { ANKORA_TIMEZONE } from '@/lib/date/tz';

/**
 * Pure aggregation for the admin panel (audit of 1 October 2026, H6 §3.3).
 *
 * Everything here turns rows into NUMBERS and week labels. No function returns
 * a row, an identifier or a date finer than a week: what leaves this module is
 * safe to render on a founder's screen and to paste in an issue.
 */

/**
 * A count as displayed: `'< 5'` between 1 and 4, otherwise rounded to the
 * nearest 5. 0 stays 0: it says nothing about anyone.
 *
 * Small counts re-identify. With three sign-ups in a week, the founder who saw
 * three friends register knows exactly who is behind every other figure on the
 * screen. Masking alone is not enough: the security review of 2 October 2026
 * recovered a masked cell by subtraction (total 30, granted 20, never chosen 7
 * → refused = 3). Rounding every shown count blurs each one by up to ±2, so no
 * difference of shown counts pins a masked cell down.
 *
 * Residual: comparing two screens taken a day apart still reveals a change of
 * one person; only a single screenshot is protected.
 *
 * `'hidden'` is the secondary suppression of a partition (see
 * `consentBreakdown`): a cell masked so that another one cannot be recovered.
 */
export type SmallCount = number | '< 5' | 'hidden';

export function maskSmallCount(n: number): SmallCount {
  if (n > 0 && n < 5) return '< 5';
  return 5 * Math.round(n / 5);
}

/** The calendar day of an instant in Brussels, as `YYYY-MM-DD`. */
export function brusselsDay(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ANKORA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

const DAY_MS = 86_400_000;

function utcStamp(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

function isoDay(stamp: number): string {
  return new Date(stamp).toISOString().slice(0, 10);
}

/**
 * The Monday of the week holding `day` (a zone-less calendar date). Runs on
 * `Date.UTC` so the reader's own timezone never moves the boundary.
 */
export function mondayOf(day: string): string {
  const stamp = utcStamp(day);
  const weekday = new Date(stamp).getUTCDay(); // 0 = Sunday
  return isoDay(stamp - ((weekday + 6) % 7) * DAY_MS);
}

/** The Mondays of the last `count` weeks, oldest first, ending with the week of `today`. */
export function trailingWeeks(today: string, count: number): string[] {
  const last = utcStamp(mondayOf(today));
  return Array.from({ length: count }, (_, i) => isoDay(last - (count - 1 - i) * 7 * DAY_MS));
}

export type WeeklySignups = { week: string; signups: SmallCount };

/**
 * Sign-ups per Brussels week. `createdAt` are instants (ISO strings); a sign-up
 * at 00:30 on a Monday in Brussels belongs to the NEW week even though it is
 * still Sunday in UTC.
 */
export function signupsByWeek(createdAt: string[], today: string, weeks: number): WeeklySignups[] {
  const labels = trailingWeeks(today, weeks);
  const counts = new Map(labels.map((w) => [w, 0]));
  for (const instant of createdAt) {
    const week = mondayOf(brusselsDay(new Date(instant)));
    const current = counts.get(week);
    if (current !== undefined) counts.set(week, current + 1);
  }
  return labels.map((week) => ({ week, signups: maskSmallCount(counts.get(week) ?? 0) }));
}

export type ActivityRow = { workspace_id: string | null; occurred_at: string };
export type ActiveWorkspaces = { day1: SmallCount; days7: SmallCount; days30: SmallCount };

/** Distinct workspaces with at least one write in the last 1, 7 and 30 days (rolling). */
export function activeWorkspaces(rows: ActivityRow[], now: Date): ActiveWorkspaces {
  const within = (days: number) => {
    const since = now.getTime() - days * DAY_MS;
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.workspace_id && Date.parse(r.occurred_at) >= since) seen.add(r.workspace_id);
    }
    return maskSmallCount(seen.size);
  };
  return { day1: within(1), days7: within(7), days30: within(30) };
}

export type ConsentBreakdown = {
  granted: SmallCount;
  refused: SmallCount;
  neverChosen: SmallCount;
};

/**
 * Analytics consent from the last state per person (`user_consents` holds one
 * row per person and scope). Whoever has no row has never chosen.
 *
 * The three cells add up to the user total shown elsewhere on the screen, so a
 * lone masked cell would be « total − the other two », rounding or not (a brute
 * force over every partition pinned a third of them). When exactly one cell is
 * masked, the smallest of the other two is hidden as well: two unknowns, one
 * equation. Measured residual: about 0.2 % of real partitions still pin the
 * masked cell, all with every true value at the edge of its rounding interval.
 */
export function consentBreakdown(
  totalUsers: number,
  granted: number,
  refused: number,
): ConsentBreakdown {
  const raw = { granted, refused, neverChosen: Math.max(0, totalUsers - granted - refused) };
  const shown: ConsentBreakdown = {
    granted: maskSmallCount(raw.granted),
    refused: maskSmallCount(raw.refused),
    neverChosen: maskSmallCount(raw.neverChosen),
  };
  const keys = ['granted', 'refused', 'neverChosen'] as const;
  const masked = keys.filter((k) => shown[k] === '< 5');
  if (masked.length === 1) {
    const second = keys.filter((k) => k !== masked[0]).sort((a, b) => raw[a] - raw[b])[0];
    if (second) shown[second] = 'hidden';
  }
  return shown;
}
