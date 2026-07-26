import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * `formatDate` and the runtime timezone.
 *
 * Expense dates are date-only values (`occurred_on` is a Postgres `date`).
 * `new Date('2026-07-18')` is parsed as midnight UTC by spec, so formatting it
 * in the runtime timezone renders the 17th anywhere west of Greenwich — a wrong
 * day on screen, and a hydration mismatch between a Vercel server on UTC and
 * the visitor's browser.
 *
 * The fix is deliberately narrow: UTC applies ONLY to date-only strings. A
 * blanket `timeZone: 'UTC'` would have corrupted the three callers that pass a
 * real instant — the account deletion dates (`scheduled_for`, `cancelled_at`,
 * both `timestamptz`). A Belgian user requesting deletion between 00:00 and
 * 02:00 local would have been shown an erasure date off by one day, on a
 * legally binding figure. That asymmetry is what the two groups below pin.
 *
 * ⚠️ This lives in its own file on purpose. `dateFormatterCache` in
 * `formatters.ts` is module-level, and `tests/setup.ts` pins no `TZ`, so the
 * timezone must be set BEFORE the module is imported — hence the dynamic
 * import. Doing this inside `formatters.test.ts` would poison the cache for
 * every other spec in that file.
 */

const ORIGINAL_TZ = process.env.TZ;

// A timezone far enough west that midnight UTC is still the previous day.
const WESTERN_TZ = 'America/New_York';

let formatDate: typeof import('../formatters').formatDate;

beforeAll(async () => {
  process.env.TZ = WESTERN_TZ;
  ({ formatDate } = await import('../formatters'));
});

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('formatDate — date-only values ignore the runtime timezone', () => {
  it('renders the day that was written, not the day before', () => {
    // `style: 'medium'` — the default `'long'` would render "July 18, 2026".
    expect(formatDate('2026-07-18', 'en', 'medium')).toContain('18');
  });

  it('does not drift for the first of a month', () => {
    // The case that hides an expense: drift here files it under the previous
    // month, where the current list will never show it.
    expect(formatDate('2026-08-01', 'en', 'medium')).toContain('1');
    expect(formatDate('2026-08-01', 'en', 'medium')).toMatch(/Aug/);
  });

  it('holds for the French locale too', () => {
    expect(formatDate('2026-07-18', 'fr-BE', 'medium')).toContain('18');
  });
});

describe('formatDate — real instants keep the runtime timezone', () => {
  it('leaves a Date object alone', () => {
    // The RGPD deletion dates take this path. Forcing UTC here would shift the
    // displayed erasure date for a user acting late in the evening.
    const instant = new Date('2026-07-18T23:30:00Z');
    const rendered = formatDate(instant, 'en', 'medium');
    // 23:30 UTC is 19:30 in New York on the SAME day, so the 18th stands —
    // what matters is that the value is read in the runtime zone, unchanged.
    expect(rendered).toContain('18');
  });

  it('shifts a full ISO instant according to the runtime zone', () => {
    // 02:00 UTC on the 19th is 22:00 on the 18th in New York. Rendering "18"
    // proves the runtime timezone is still being applied to instants — the
    // exact behaviour the date-only predicate must not take away.
    const rendered = formatDate('2026-07-19T02:00:00Z', 'en', 'medium');
    expect(rendered).toContain('18');
  });
});
