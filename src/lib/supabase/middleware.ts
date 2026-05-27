import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
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
  // 503-diag (2026-05-27): the previous version let any thrown error from
  // `getUser()` propagate to the proxy caller, which surfaced as a bare
  // HTTP 5xx the Edge runtime cannot interpret. We now catch + log + swallow
  // so the response is always returned and downstream Server Actions can
  // observe the failure mode via `require-user` instrumentation. Filter
  // Vercel logs on `[503-diag] middleware`.
  try {
    await supabase.auth.getUser();
  } catch (e) {
    log.error('[503-diag] middleware getUser threw', {
      path: request.nextUrl.pathname,
      ...(e instanceof Error
        ? { name: e.name, msg: e.message, stack: e.stack }
        : { msg: String(e) }),
    });
  }

  return response;
}
