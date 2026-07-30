import { describe, expect, it } from 'vitest';

import {
  AUTH_BACKEND_UNAVAILABLE_DIGEST,
  EXPECTED_SESSION_END_CODES,
  classifyAuthFailure,
  endsSession,
  findSessionCookieNames,
  isExpectedSessionEnd,
} from '../auth-error';

/**
 * The classifier answers one question — "did the auth server rule on this
 * session, or could we not get a ruling?" — and every consumer branches on it.
 * Getting it wrong in the `session-ended` direction logs out a whole userbase
 * during an outage, which is the defect measured on 2026-07-30. So the two
 * directions are asserted separately and neither is allowed to drift.
 */

/** Shape of a real `AuthApiError` as it reaches us over the wire. */
function authApiError(code: string, status = 400) {
  return {
    name: 'AuthApiError',
    message: `Invalid Refresh Token: ${code}`,
    status,
    code,
    __isAuthError: true,
  };
}

describe('classifyAuthFailure — the auth server ruled: the session is over', () => {
  // The two codes actually observed in Ankora's Vercel logs on 2026-07-29,
  // plus the neighbouring codes in the same family.
  it.each(EXPECTED_SESSION_END_CODES)('treats %s as a session end', (code) => {
    expect(classifyAuthFailure(authApiError(code))).toBe('session-ended');
    expect(isExpectedSessionEnd(authApiError(code))).toBe(true);
  });

  it('treats a 401 from the auth server as a session end', () => {
    expect(
      classifyAuthFailure({ name: 'AuthApiError', status: 401, message: 'JWT expired', __isAuthError: true }),
    ).toBe('session-ended');
  });

  it('treats AuthSessionMissingError as a session end', () => {
    expect(
      classifyAuthFailure({
        name: 'AuthSessionMissingError',
        message: 'Auth session missing!',
        status: 400,
        __isAuthError: true,
      }),
    ).toBe('session-ended');
  });

  // The load-bearing property of keying on "who answered" rather than on a code
  // list: a code Supabase ships next year still lands on the session side, so
  // nobody has to remember to extend an enum.
  it('treats an UNKNOWN 4xx auth code as a session end, not an outage', () => {
    expect(classifyAuthFailure(authApiError('some_code_invented_in_2027', 403))).toBe(
      'session-ended',
    );
    expect(isExpectedSessionEnd(authApiError('some_code_invented_in_2027', 403))).toBe(false);
  });
});

describe('classifyAuthFailure — no ruling available: never cost anyone their session', () => {
  it('treats AuthRetryableFetchError as backend-unavailable', () => {
    // status 0 — the request never completed, so the status test alone would miss it.
    expect(
      classifyAuthFailure({
        name: 'AuthRetryableFetchError',
        message: 'Failed to fetch',
        status: 0,
        __isAuthError: true,
      }),
    ).toBe('backend-unavailable');
  });

  it.each([500, 502, 503, 504])('treats a %s from the auth server as backend-unavailable', (status) => {
    expect(
      classifyAuthFailure({ name: 'AuthApiError', message: 'upstream', status, __isAuthError: true }),
    ).toBe('backend-unavailable');
  });

  // 408 and 429 are 4xx but they are not rulings — they mean "ask again later".
  // Spending a session on them would log users out under load, which is exactly
  // when it hurts most.
  it.each([408, 429])('treats %s as backend-unavailable, not a session end', (status) => {
    expect(
      classifyAuthFailure({ name: 'AuthApiError', message: 'slow down', status, __isAuthError: true }),
    ).toBe('backend-unavailable');
  });

  it('treats a bare fetch TypeError as backend-unavailable', () => {
    // Belt-and-braces. auth-js wraps transport failures into
    // AuthRetryableFetchError before we ever see them (fetch.js:106-110), so this
    // shape should not reach us — but if it ever does, it must not cost a session.
    expect(classifyAuthFailure(new TypeError('fetch failed'))).toBe('backend-unavailable');
  });

  it('treats an auth error carrying no status as backend-unavailable', () => {
    expect(classifyAuthFailure({ name: 'AuthUnknownError', __isAuthError: true })).toBe(
      'backend-unavailable',
    );
  });
});

/**
 * Regression guard, and it exists because the first cut of this classifier got it
 * wrong. Routing a cookie decode failure to `backend-unavailable` was measured on
 * 2026-07-30 to turn a corrupted session cookie into an HTTP 500 on `/app` — with
 * the bad cookie left in place, so the visitor could not reach the login page that
 * would have replaced it. A dead end is worse than the bug it replaced.
 */
describe('classifyAuthFailure — a cookie we cannot read is a session end, not an outage', () => {
  it('treats a base64 decode error as session-unreadable', () => {
    expect(
      classifyAuthFailure(new Error('Invalid Base64-URL character "%" at position 3')),
    ).toBe('session-unreadable');
  });

  it('routes session-unreadable to the purge-and-login path', () => {
    expect(endsSession('session-unreadable')).toBe(true);
    expect(endsSession('session-ended')).toBe(true);
    expect(endsSession('backend-unavailable')).toBe(false);
  });

  it.each([undefined, null, 'a string', 42])(
    'treats the non-error value %s as session-unreadable',
    (value) => {
      expect(classifyAuthFailure(value)).toBe('session-unreadable');
    },
  );
});

/**
 * The digest is a contract between a server throw and a client boundary, and the
 * two ends cannot see each other. Nothing else fails if it drifts — the boundary
 * simply stops recognising the outage and quietly starts telling users their app
 * is broken. Pinning the literal is the only thing that makes the drift loud.
 */
describe('AUTH_BACKEND_UNAVAILABLE_DIGEST', () => {
  it('is the exact string the error boundary matches on', () => {
    expect(AUTH_BACKEND_UNAVAILABLE_DIGEST).toBe('ANKORA_AUTH_BACKEND_UNAVAILABLE');
  });

  it('does not collide with the NEXT_* digests the framework owns', () => {
    expect(AUTH_BACKEND_UNAVAILABLE_DIGEST.startsWith('NEXT_')).toBe(false);
  });
});

describe('findSessionCookieNames', () => {
  it('finds the unchunked session cookie', () => {
    expect(findSessionCookieNames(['sb-abc123-auth-token', 'NEXT_LOCALE'])).toEqual([
      'sb-abc123-auth-token',
    ]);
  });

  it('finds every numbered chunk of a large session', () => {
    expect(
      findSessionCookieNames([
        'sb-abc123-auth-token.0',
        'sb-abc123-auth-token.1',
        'sb-abc123-auth-token.2',
      ]),
    ).toHaveLength(3);
  });

  it('leaves unrelated cookies alone', () => {
    // Notably the PKCE verifier: it is not a session cookie, and clearing it
    // mid-OAuth would break a sign-in that is still in flight.
    expect(
      findSessionCookieNames([
        'NEXT_LOCALE',
        'klaro',
        'sb-abc123-auth-token-code-verifier',
        '__Host-next-auth',
      ]),
    ).toEqual([]);
  });
});
