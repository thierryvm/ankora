/**
 * The month a screen is looking at, read from `?period=YYYY-MM`.
 *
 * Moved verbatim out of `app/charges/page.tsx` when the cockpit started
 * following the chosen month too (ADR-046, lot 2): two screens reading the
 * same parameter with two parsers is how one of them ends up showing a month
 * the other refuses. Pure — no clock, no framework: the caller passes the
 * current month.
 */

export type Period = { year: number; month: number };

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** No payment data can exist before the app's first release month. */
export const PERIOD_FLOOR: Period = { year: 2026, month: 1 };

/** Forward horizon (@thierry 2026-07-19): browse up to a year ahead to see
 *  what's coming — due dates render for that month, ledger is simply empty. */
export const FUTURE_SPAN_MONTHS = 12;

export const periodOrdinal = (p: Period): number => p.year * 12 + p.month;

export const isSamePeriod = (a: Period, b: Period): boolean =>
  periodOrdinal(a) === periodOrdinal(b);

/** `viewed` is the month right after `current` (year-wrap aware). */
export const isNextPeriod = (viewed: Period, current: Period): boolean =>
  periodOrdinal(viewed) === periodOrdinal(current) + 1;

/**
 * The plan's « I made this transfer » can be written for the current month and
 * for the NEXT one only (@thierry, 24 Sept. 2026): the salary lands around the
 * 28th, and the next month's transfers are made then. Further ahead, or a past
 * month, offers no button.
 */
export const transferPlanAllowed = (viewed: Period, current: Period): boolean =>
  isSamePeriod(viewed, current) || isNextPeriod(viewed, current);

/**
 * Month-history navigation (@thierry priority 2026-07-19): `?period=YYYY-MM`
 * selects which month the page shows. Invalid, pre-floor, or beyond-horizon
 * values silently fall back to the current period — the URL is user-controlled
 * input, never trusted.
 */
export function parseViewedPeriod(raw: string | undefined, current: Period): Period {
  if (!raw || !PERIOD_RE.test(raw)) return current;
  const [y, m] = raw.split('-').map(Number) as [number, number];
  const candidate = { year: y, month: m };
  if (
    periodOrdinal(candidate) > periodOrdinal(current) + FUTURE_SPAN_MONTHS ||
    periodOrdinal(candidate) < periodOrdinal(PERIOD_FLOOR)
  ) {
    return current;
  }
  return candidate;
}

export const shiftPeriod = (p: Period, delta: 1 | -1): Period => {
  const total = p.year * 12 + (p.month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
};

export const toPeriodParam = (p: Period): string => `${p.year}-${String(p.month).padStart(2, '0')}`;

/** The ‹ › arrows: a parameter for each neighbour inside the window, else null. */
export function viewedPeriodNav(
  viewed: Period,
  current: Period,
): { prevParam: string | null; nextParam: string | null; isCurrent: boolean } {
  const prev = shiftPeriod(viewed, -1);
  const next = shiftPeriod(viewed, 1);
  return {
    prevParam: periodOrdinal(prev) >= periodOrdinal(PERIOD_FLOOR) ? toPeriodParam(prev) : null,
    nextParam:
      periodOrdinal(next) <= periodOrdinal(current) + FUTURE_SPAN_MONTHS
        ? toPeriodParam(next)
        : null,
    isCurrent: isSamePeriod(viewed, current),
  };
}
