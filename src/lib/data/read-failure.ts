/**
 * The same question as `@/lib/auth/auth-error`, one layer down: when a Supabase
 * read fails, did the database answer "there is no such row", or did we fail to
 * get an answer?
 *
 * The two are not interchangeable, and Ankora kept confusing them. Five call
 * sites asked "does this user have a workspace / has this user onboarded?",
 * discarded the `error` field, and read `!data` as "no". So a connection blip, a
 * pool exhaustion or an RLS regression did not surface as a failure — it told an
 * established user they had no workspace and walked them into onboarding.
 *
 * For a budgeting app that is the worst possible lie. Someone who tracks their
 * money opens the dashboard and is asked to create their space again: the only
 * reasonable reading is that the data is gone. Nothing is gone; a SELECT timed
 * out. The incident already had a precedent in this codebase — the 2026-07-18
 * note in `workspace-snapshot.ts` records a failing SELECT rendering as an empty
 * workspace, "looks like data loss". Same motif, caught once, not generalised.
 *
 * The rule: an error from PostgREST means we could not read. Only the ABSENCE of
 * an error licenses a conclusion about what exists.
 */

/**
 * Carried by `DataReadUnavailableError` so `src/app/[locale]/error.tsx` can tell
 * this apart from a genuine bug in production, where React strips the message,
 * name and stack and leaves only `digest`.
 *
 * Kept distinct from `AUTH_BACKEND_UNAVAILABLE_DIGEST` because the two screens
 * can honestly say different things: the auth one can promise the session was
 * not closed, this one can promise nothing was modified. A single shared screen
 * would have to blur one of those into something not quite true.
 *
 * This module imports nothing, so a client component can read the constant
 * without dragging server-only code into the browser bundle.
 */
export const DATA_READ_UNAVAILABLE_DIGEST = 'ANKORA_DATA_READ_UNAVAILABLE';

/**
 * Raised when a read that a guard depends on could not be completed. Deliberately
 * NOT raised when the query succeeded and simply matched nothing — that is a real
 * answer and callers must keep acting on it.
 */
export class DataReadUnavailableError extends Error {
  override readonly name = 'DataReadUnavailableError';

  readonly digest = DATA_READ_UNAVAILABLE_DIGEST;

  constructor(
    readonly where: string,
    override readonly cause: unknown,
  ) {
    super(`Supabase read unavailable: ${where}`);
  }
}

type MaybePostgrestError = { code?: unknown; message?: unknown };

/**
 * `PGRST116` is PostgREST's "JSON object requested, multiple (or no) rows
 * returned" — what `.single()` raises when nothing matched.
 *
 * It arrives as an error but it is an ANSWER, not a failure: the database
 * successfully determined the row does not exist. Treating it as unavailability
 * would push a genuinely new user into a "service unavailable" screen instead of
 * onboarding, which is the mirror image of the bug this module exists to kill.
 *
 * `.maybeSingle()` returns `{ data: null, error: null }` for the same situation
 * and never produces this code.
 */
export function isMissingRowError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as MaybePostgrestError).code === 'PGRST116';
}

/**
 * Guard clause for any read whose result drives a routing or authorisation
 * decision. Throws when the read could not be completed; returns quietly when it
 * succeeded — including when it succeeded and found nothing.
 *
 * @param where  Short call-site label. Ends up in the log, never in the UI.
 */
export function assertReadable(error: unknown, where: string): void {
  if (!error || isMissingRowError(error)) return;
  throw new DataReadUnavailableError(where, error);
}

/**
 * Shape a read failure for the log. Only `code` — a PostgREST `message` can echo
 * back column values from the failing statement, and `@/lib/log` does not redact
 * free-text message fields.
 */
export function describeReadFailure(error: unknown): Record<string, unknown> {
  if (typeof error !== 'object' || error === null) return { kind: typeof error };
  return { code: (error as MaybePostgrestError).code ?? 'unknown' };
}
