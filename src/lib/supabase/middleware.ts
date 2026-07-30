import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { classifyAuthFailure, endsSession, findSessionCookieNames } from '@/lib/auth/auth-error';
import { log } from '@/lib/log';
import type { Database } from '@/lib/supabase/types';

export async function updateSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Refreshes the session cookie when the access token is close to expiry.
  //
  // The `error` this returns used to be discarded (`await supabase.auth.getUser()`,
  // result unread) behind a `try/catch` added during the 2026-05-27 503 hunt. That
  // catch was dead code for the failure mode it was aimed at: `getUser()` does not
  // throw on an auth verdict — auth-js catches its own errors and hands them back
  // in `error` (`GoTrueClient._getUser`). So the middleware had no idea whether the
  // visitor's session was alive, dead, or unknowable, and took no action either way.
  //
  // What the middleware does NOT do is redirect. `requireUser()` owns that, because
  // it is the only layer that knows the active locale: `localePrefix: 'as-needed'`
  // means a bare `/login` is the French page, and a redirect issued here — before
  // next-intl has resolved the locale onto the response — would drop an English
  // visitor on the French login page. Cf. the execution-order note in `src/proxy.ts`.
  let error: unknown = null;
  try {
    ({ error } = await supabase.auth.getUser());
  } catch (thrown) {
    // A throw out of `getUser()` is never an auth verdict — auth-js rethrows only
    // what it does not own (transport failure, decode error). Treated as an outage
    // on purpose: see the outage branch below.
    error = thrown;
  }

  if (!error) {
    return response;
  }

  const kind = classifyAuthFailure(error);

  if (!endsSession(kind)) {
    // Supabase could not be reached, or answered 5xx. Leave every cookie exactly
    // as it is. Clearing them here would convert an outage into a mass logout and
    // hide the incident behind a login page — the failure this branch exists to
    // prevent, measured on 2026-07-30.
    log.error('middleware: auth backend unavailable, session left intact', {
      path: request.nextUrl.pathname,
      ...describe(error),
    });
    return response;
  }

  // The session is over — either the auth server ruled so (a refresh token
  // expires, is rotated, is consumed by another tab, or is revoked on password
  // change) or the cookie we hold can no longer be read at all. Both are normal
  // lifecycle events. Drop the dead cookies so the next request starts clean, and
  // let `requireUser()` do the locale-aware redirect.
  //
  // auth-js already purges via `_removeSession()` for non-retryable errors, so
  // this is belt-and-braces — deliberately. That purge is an internal of a
  // dependency we do not control; asserting it here means a future supabase-js
  // release cannot quietly leave a dead cookie in place, which would loop the
  // visitor through a failing refresh on every single request.
  clearSessionCookies(request, response);

  log.info('middleware: session ended, cookies cleared', {
    path: request.nextUrl.pathname,
    kind,
    ...describe(error),
  });

  return response;
}

function clearSessionCookies(request: NextRequest, response: NextResponse): void {
  const names = findSessionCookieNames(request.cookies.getAll().map(({ name }) => name));

  for (const name of names) {
    request.cookies.delete(name);
    // `set('')` with `maxAge: 0` rather than `delete()`: the response must carry an
    // explicit expiring Set-Cookie for the browser to drop it, and it must match
    // the path the cookie was written on.
    response.cookies.set(name, '', { path: '/', maxAge: 0 });
  }
}

/**
 * Shape an auth failure for the log without leaking the token itself. `@/lib/log`
 * redacts `*.token` / `*.refresh_token` keys, but an error `message` is a free
 * string and is not covered — so only `code`, `status` and `name` are recorded.
 */
function describe(error: unknown): Record<string, unknown> {
  const record = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
  if (!record) {
    return { kind: typeof error };
  }
  return {
    name: typeof record.name === 'string' ? record.name : undefined,
    code: typeof record.code === 'string' ? record.code : undefined,
    status: typeof record.status === 'number' ? record.status : undefined,
  };
}
