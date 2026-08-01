// @vitest-environment node
//
// `next/server`'s NextRequest/NextResponse are built on the Web Fetch primitives
// and want the node environment, not the suite default (jsdom).
//
// `@/lib/env` is mocked because `src/lib/env.ts` parses `process.env` at import
// and throws when required variables are missing — the case in CI, where the
// `quality` job declares no `env:` block.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const getUserMock = vi.hoisted(() => vi.fn());
const logInfoMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  },
}));

// The real client would open a network connection. What matters here is the
// middleware's reaction to `getUser()`'s outcome, so the client is reduced to
// exactly that call — plus the cookie adapter wiring, which the middleware
// installs and which must stay untouched by this stub.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: () => getUserMock() },
  }),
}));

vi.mock('@/lib/log', () => ({
  log: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: logInfoMock,
    warn: vi.fn(),
    error: logErrorMock,
    fatal: vi.fn(),
    child: vi.fn(),
  },
}));

import { updateSession } from '../middleware';

const SESSION_COOKIE = 'sb-fkscfvoouwufyjwnfvhb-auth-token';

function requestWithSession(path = '/app', cookies: Record<string, string> = {}) {
  const request = new NextRequest(`https://ankora.test${path}`);
  request.cookies.set(SESSION_COOKIE, 'base64-c3RhbGU');
  for (const [name, value] of Object.entries(cookies)) {
    request.cookies.set(name, value);
  }
  return request;
}

/** The expiring `Set-Cookie` entries the response carries for a given name. */
function clearedCookie(response: NextResponse, name: string) {
  const entry = response.cookies.get(name);
  return entry ? { value: entry.value, maxAge: entry.maxAge } : undefined;
}

const refreshTokenNotFound = {
  name: 'AuthApiError',
  message: 'Invalid Refresh Token: Refresh Token Not Found',
  status: 400,
  code: 'refresh_token_not_found',
  __isAuthError: true,
};

beforeEach(() => {
  getUserMock.mockReset();
  logInfoMock.mockReset();
  logErrorMock.mockReset();
});

/**
 * The regression this file exists for. Observed in production on 2026-07-29:
 * `refresh_token_not_found`, 4 occurrences, 2 users. A refresh token dying is a
 * normal step in a session's life — it must cost the visitor a trip to the login
 * page and nothing else, and it must never be confused with Supabase being down.
 */
describe('updateSession — an expired session is a normal event', () => {
  it('clears the session cookie when the refresh token no longer exists', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: refreshTokenNotFound });

    const request = requestWithSession();
    const response = await updateSession(request, NextResponse.next());

    expect(clearedCookie(response, SESSION_COOKIE)).toEqual({ value: '', maxAge: 0 });
  });

  it('clears every chunk of a session that spanned several cookies', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: refreshTokenNotFound });

    const request = new NextRequest('https://ankora.test/app');
    request.cookies.set(`${SESSION_COOKIE}.0`, 'base64-chunk0');
    request.cookies.set(`${SESSION_COOKIE}.1`, 'base64-chunk1');

    const response = await updateSession(request, NextResponse.next());

    expect(clearedCookie(response, `${SESSION_COOKIE}.0`)).toEqual({ value: '', maxAge: 0 });
    expect(clearedCookie(response, `${SESSION_COOKIE}.1`)).toEqual({ value: '', maxAge: 0 });
  });

  it('does not throw, and returns the response it was handed', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: refreshTokenNotFound });

    const response = NextResponse.next();
    await expect(updateSession(requestWithSession(), response)).resolves.toBe(response);
  });

  it('clears the cookie when it is corrupted beyond reading', async () => {
    // `@supabase/ssr` throws a plain Error out of `stringFromBase64URL` for a
    // truncated or mangled cookie. Routing that to the outage branch was measured
    // on 2026-07-30 to strand the visitor on an HTTP 500 with the bad cookie still
    // set — unrecoverable, since the cookie is what breaks every page.
    getUserMock.mockRejectedValue(new Error('Invalid Base64-URL character "%" at position 3'));

    const request = requestWithSession();
    const response = await updateSession(request, NextResponse.next());

    expect(clearedCookie(response, SESSION_COOKIE)).toEqual({ value: '', maxAge: 0 });
  });

  it('leaves cookies that are not part of the session alone', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: refreshTokenNotFound });

    const request = requestWithSession('/app', {
      NEXT_LOCALE: 'en',
      [`${SESSION_COOKIE}-code-verifier`]: 'pkce-verifier',
    });
    const response = await updateSession(request, NextResponse.next());

    // Clearing the PKCE verifier would break a sign-in still in flight.
    expect(response.cookies.get(`${SESSION_COOKIE}-code-verifier`)).toBeUndefined();
    expect(response.cookies.get('NEXT_LOCALE')).toBeUndefined();
  });
});

/**
 * The other half, and the one that was actually broken. Measured on 2026-07-30:
 * with Supabase unreachable and a valid session, `/app` answered `307 → /login`.
 * An outage must not be laundered into a logout.
 */
describe('updateSession — an outage must not log anybody out', () => {
  const outages = [
    [
      'a transport failure',
      {
        name: 'AuthRetryableFetchError',
        message: 'Failed to fetch',
        status: 0,
        __isAuthError: true,
      },
    ],
    [
      'a 503 from the auth server',
      { name: 'AuthApiError', message: 'unavailable', status: 503, __isAuthError: true },
    ],
    [
      'rate limiting',
      { name: 'AuthApiError', message: 'too many requests', status: 429, __isAuthError: true },
    ],
  ] as const;

  it.each(outages)('leaves the session cookie intact on %s', async (_label, error) => {
    getUserMock.mockResolvedValue({ data: { user: null }, error });

    const request = requestWithSession();
    const response = await updateSession(request, NextResponse.next());

    expect(clearedCookie(response, SESSION_COOKIE)).toBeUndefined();
    expect(request.cookies.get(SESSION_COOKIE)?.value).toBe('base64-c3RhbGU');
  });

  it('leaves the session intact when getUser() throws outright', async () => {
    // A throw out of `getUser()` is never an auth verdict — auth-js rethrows
    // only what it does not own. Concluding "session over" here is a guess, and
    // the wrong one costs everybody their session at once.
    getUserMock.mockRejectedValue(new TypeError('fetch failed'));

    const request = requestWithSession();
    const response = await updateSession(request, NextResponse.next());

    expect(clearedCookie(response, SESSION_COOKIE)).toBeUndefined();
  });

  it('never lets the failure escape as an exception', async () => {
    getUserMock.mockRejectedValue(new TypeError('fetch failed'));

    const response = NextResponse.next();
    await expect(updateSession(requestWithSession(), response)).resolves.toBe(response);
  });

  it('logs the outage at error level so it is visible as an incident', async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthRetryableFetchError', status: 0, __isAuthError: true },
    });

    await updateSession(requestWithSession(), NextResponse.next());

    expect(logErrorMock).toHaveBeenCalledTimes(1);
    const [msg, bindings] = logErrorMock.mock.calls[0] ?? [];
    expect(msg).toMatch(/unavailable/i);
    expect(bindings).toMatchObject({ path: '/app', name: 'AuthRetryableFetchError' });
  });
});

describe('updateSession — the nominal path stays quiet', () => {
  it('touches no cookie and logs nothing when the session is valid', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const request = requestWithSession();
    const response = await updateSession(request, NextResponse.next());

    expect(clearedCookie(response, SESSION_COOKIE)).toBeUndefined();
    expect(logInfoMock).not.toHaveBeenCalled();
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it('does not clear anything for an anonymous visitor with no session at all', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const request = new NextRequest('https://ankora.test/');
    const response = await updateSession(request, NextResponse.next());

    expect(response.cookies.getAll()).toHaveLength(0);
    expect(logErrorMock).not.toHaveBeenCalled();
  });
});

/**
 * A lint rather than a behavioural proof, and deliberately load-bearing: the
 * previous version of this file called `getUser()` and discarded its result
 * inside a `try/catch` that could not fire, which is how the middleware ended up
 * blind to the session state for two months.
 */
describe('the error is read, not discarded', () => {
  it('destructures the error out of getUser()', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(__dirname, '..', 'middleware.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    expect(code).toMatch(/\{\s*error\s*\}\s*=\s*await supabase\.auth\.getUser\(\)/);
    expect(code).toContain('classifyAuthFailure');
  });
});
