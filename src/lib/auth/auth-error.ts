/**
 * One question, asked in one place: when a Supabase auth call fails, did the
 * **auth server give us a verdict about this session**, or did we **fail to get
 * a verdict at all**?
 *
 * That distinction is the whole point of this module, and it is not cosmetic —
 * the two cases demand opposite reactions:
 *
 *   - A verdict ("this refresh token no longer exists") is a NORMAL event in a
 *     session lifecycle. Refresh tokens die: they expire, they are rotated, they
 *     are consumed by another tab, they are revoked on password change. The right
 *     answer is to drop the dead cookie and send the visitor to the login page,
 *     with no error surfaced. Nothing is broken.
 *
 *   - No verdict (network unreachable, DNS failure, 5xx from the auth server) is
 *     an OUTAGE. Treating it like a dead session logs out every signed-in user
 *     for the duration of the incident, and — worse — hides the incident behind
 *     a login page, so it reads as "users keep having to sign in again" instead
 *     of "Supabase is down". That was the live defect this module was written to
 *     fix; measured on 2026-07-30 by pointing the app at an unreachable auth host
 *     with a perfectly valid session: `/app` answered `307 → /login`.
 *
 * The dividing line is deliberately about **who answered**, not about which code
 * came back. Enumerating "expected" error codes alone would mean every code
 * Supabase adds later defaults to the wrong side; keying on "did we reach the
 * server" keeps unknown 4xx verdicts on the session side (the server judged this
 * session) and everything unanswerable on the outage side.
 */

/**
 * Auth-server verdicts that end a session, listed for documentation and for the
 * `isExpectedSessionEnd` fast path. The classifier does NOT depend on this list
 * being exhaustive — any 4xx auth verdict is treated as a session end.
 *
 * Sources: `refresh_token_not_found` and `refresh_token_already_used` are the two
 * observed in Ankora's Vercel logs; the rest are the neighbouring GoTrue codes in
 * the same family.
 */
export const EXPECTED_SESSION_END_CODES = [
  'refresh_token_not_found',
  'refresh_token_already_used',
  'refresh_token_revoked',
  'session_not_found',
  'session_expired',
  'bad_jwt',
] as const;

export type AuthFailureKind =
  /** The auth server ruled on this session and the session is over. Purge + login. */
  | 'session-ended'
  /**
   * The session cookie we hold cannot even be read — a corrupted or truncated
   * value, a chunk set that no longer reassembles. No request was made, so this
   * says nothing about Supabase's health; it says our stored state is garbage.
   * Handled exactly like `session-ended` (purge + login) and kept as a separate
   * kind only so the log names the real cause.
   */
  | 'session-unreadable'
  /** We could not get a ruling. Do NOT log anyone out; let the failure surface. */
  | 'backend-unavailable';

/** The two kinds that mean "drop the cookie and send them to login". */
export function endsSession(kind: AuthFailureKind): boolean {
  return kind === 'session-ended' || kind === 'session-unreadable';
}

/**
 * Stable `digest` carried by `AuthBackendUnavailableError` so the client error
 * boundary can recognise it **in production**.
 *
 * Why a digest and not `error.name`: React strips server error messages, names
 * and stacks before they reach a client `error.tsx` — by design, so a stack never
 * leaks to a browser. `digest` is the one field that survives, which is exactly
 * how `redirect()` and `notFound()` signal themselves across the same boundary.
 * Setting our own means the boundary can tell "Supabase is unreachable" from "a
 * genuine bug", and show an honest degraded screen for the first without
 * mislabelling the second.
 *
 * It lives in this module — not in `require-user.ts` — because `error.tsx` is a
 * client component: importing the server-only auth module would drag
 * `next/headers` into the client bundle and fail the build. This file imports
 * nothing, so it is safe on both sides.
 *
 * The `ANKORA_` prefix keeps it clear of Next.js's own `NEXT_*` digests.
 * Changing this string breaks the boundary silently — a test pins the literal.
 */
export const AUTH_BACKEND_UNAVAILABLE_DIGEST = 'ANKORA_AUTH_BACKEND_UNAVAILABLE';

type MaybeAuthError = {
  __isAuthError?: unknown;
  name?: unknown;
  code?: unknown;
  status?: unknown;
};

function asRecord(value: unknown): MaybeAuthError | null {
  return typeof value === 'object' && value !== null ? (value as MaybeAuthError) : null;
}

/**
 * `@supabase/auth-js` brands every error it owns with `__isAuthError`. Checked
 * structurally rather than with `instanceof`: the middleware, Server Components
 * and Server Actions can each end up holding a different copy of the module, and
 * an `instanceof` that silently returns false here would misroute an ordinary
 * expired session into the outage branch.
 */
function isAuthError(error: unknown): boolean {
  const record = asRecord(error);
  if (!record) return false;
  if (record.__isAuthError === true) return true;
  return typeof record.name === 'string' && record.name.startsWith('Auth');
}

function statusOf(error: unknown): number | undefined {
  const status = asRecord(error)?.status;
  return typeof status === 'number' ? status : undefined;
}

function codeOf(error: unknown): string | undefined {
  const code = asRecord(error)?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * True when the error is one of the known session-ending verdicts. Exported for
 * logging and tests; `classifyAuthFailure` is the decision function.
 */
export function isExpectedSessionEnd(error: unknown): boolean {
  const code = codeOf(error);
  return (
    code !== undefined && (EXPECTED_SESSION_END_CODES as readonly string[]).includes(code)
  );
}

/**
 * Classify a value that came back as the `error` field of a Supabase auth call,
 * or that was thrown by one.
 *
 * Reads as a single rule: **a 4xx answer from the auth server ends the session;
 * anything we could not get an answer from is an outage.**
 */
export function classifyAuthFailure(error: unknown): AuthFailureKind {
  if (isExpectedSessionEnd(error)) {
    return 'session-ended';
  }

  // `AuthRetryableFetchError` is what auth-js raises when the request itself
  // could not complete. Its `status` is 0 for a transport failure, so the status
  // test below would not catch it.
  if (asRecord(error)?.name === 'AuthRetryableFetchError') {
    return 'backend-unavailable';
  }

  const status = statusOf(error);

  // The auth server answered and refused. Even an unfamiliar code is a ruling
  // about THIS session, not evidence that Supabase is down. 408 and 429 are the
  // two 4xx that are not rulings — they mean "ask again", so they stay outages
  // and must never cost a session.
  if (status !== undefined && status >= 400 && status < 500) {
    if (status === 408 || status === 429) return 'backend-unavailable';
    return 'session-ended';
  }

  // 5xx, status 0, or no status at all on an auth error: no usable ruling.
  if (isAuthError(error)) {
    return 'backend-unavailable';
  }

  // Not an auth error at all. This is narrower than it looks: auth-js wraps
  // EVERY transport failure into `AuthRetryableFetchError` before a caller can
  // see it (`@supabase/auth-js/dist/main/lib/fetch.js:106-110` — "fetch failed,
  // likely due to a network or CORS error"), and that is an auth error, caught
  // above. So a raw throw reaching here did not come from the network: it came
  // from the storage layer decoding our own cookie — `@supabase/ssr` throws a
  // plain `Error` out of `stringFromBase64URL` on a corrupted or truncated value.
  //
  // That distinction is load-bearing, and getting it wrong is not symmetrical.
  // Classifying it as an outage was measured on 2026-07-30 to turn a corrupted
  // cookie into an HTTP 500 on `/app` with the cookie left in place — a dead end,
  // because the visitor cannot reach the login page that would replace it. Purging
  // and redirecting is always recoverable.
  //
  // `TypeError` is still routed to the outage branch: it is the shape Node's
  // `fetch` rejects with, so if a future auth-js ever stops wrapping, the failure
  // lands on the side that costs nobody their session.
  if (error instanceof TypeError) {
    return 'backend-unavailable';
  }

  return 'session-unreadable';
}

/**
 * Names of the Supabase session cookies present on a request, including the
 * numbered chunks used when a session exceeds one cookie's size limit
 * (`sb-<ref>-auth-token`, `sb-<ref>-auth-token.0`, `.1`, …).
 *
 * Derived from the request rather than from the project ref so a cookie left
 * behind by an earlier Supabase project — or by a chunk count that has since
 * shrunk — is still cleaned up.
 */
export function findSessionCookieNames(names: readonly string[]): string[] {
  return names.filter((name) => /^sb-.+-auth-token(\.\d+)?$/.test(name));
}
