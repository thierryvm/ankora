/**
 * Canonical timezone for every date boundary in Ankora.
 *
 * Ankora is FSMA-scoped to Belgium and `next-intl` already formats in
 * Europe/Brussels. Computing boundaries in this timezone is what keeps a
 * late-evening expense from drifting to the wrong day — and, on the first of
 * the month, to a month the user cannot see.
 *
 * ⚠️ This module MUST stay dependency-free and MUST NOT carry `server-only`.
 * It is imported by `'use client'` components (`ExpensesClient`,
 * `ChargesClient`); any transitive import of `@/lib/supabase/*` would break the
 * build, and anything heavier would show up in the client bundle for a value
 * that is one string and one `Intl` call.
 *
 * It is the source: `src/lib/data/workspace-snapshot.ts` imports from here, not
 * the reverse — that file drags the server Supabase client behind it.
 */
export const ANKORA_TIMEZONE = 'Europe/Brussels';

/**
 * Today's date in Ankora's timezone, as `YYYY-MM-DD`.
 *
 * Replaces `new Date().toISOString().slice(0, 10)`, which returns the UTC day.
 * During Belgian summer time, between 00:00 and 02:00 local, UTC is still on
 * the previous day: a form defaulting to it would pre-fill YESTERDAY, and on
 * the first of the month the expense would be filed under the previous month
 * and vanish from the current list without any signal.
 *
 * `en-CA` is used because it formats as `YYYY-MM-DD` natively — the same trick
 * the month-boundary helper already relies on.
 */
export function todayInAnkoraTz(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ANKORA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
