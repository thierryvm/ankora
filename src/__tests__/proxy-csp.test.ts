// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The CSP built by `src/proxy.ts` names our Supabase project and nothing else.
 *
 * It used to allow every `*.supabase.co` host, i.e. any Supabase project, in
 * `img-src` and `connect-src`. The browser makes no direct Supabase call today
 * (`src/lib/supabase/client.ts` is imported by no app code), so `img-src` carries
 * no Supabase source at all, and `connect-src` keeps only the exact host read
 * from `NEXT_PUBLIC_SUPABASE_URL` — for that dormant browser client.
 *
 * The second half guards the ordering invariant of the proxy: the nonce and the
 * CSP must already be on the REQUEST headers when next-intl runs, because it
 * snapshots them (cf. the header comment of `src/proxy.ts`). Comparing request
 * and response headers after `proxy()` returns cannot catch a regression — by
 * then the request carries the headers whatever the order — so the mocked
 * router records what it saw at the moment it was called.
 */

const hoisted = vi.hoisted(() => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  },
  seenByRouter: [] as Array<{ nonce: string | null; csp: string | null; path: string | null }>,
}));

vi.mock('@/lib/env', () => ({ env: hoisted.env }));

// Same reason as `proxy-matcher.test.ts`: next-intl's ESM build imports
// `next/server` without an extension, which Vitest's resolver refuses. Routing
// itself is not under test here.
vi.mock('next-intl/middleware', async () => {
  const { NextResponse } = await import('next/server');
  return {
    default: () => (request: NextRequest) => {
      hoisted.seenByRouter.push({
        nonce: request.headers.get('x-nonce'),
        csp: request.headers.get('content-security-policy'),
        path: request.headers.get('x-pathname'),
      });
      return NextResponse.next();
    },
  };
});

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: async (_request: unknown, response: unknown) => response,
}));

import { proxy } from '@/proxy';

/** The sources of one directive, exactly as the browser splits them. */
function sources(csp: string, directive: string): string[] {
  const entry = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === directive || part.startsWith(`${directive} `));
  expect(entry, `${directive} present`).toBeDefined();
  return (entry ?? '').split(/\s+/).slice(1);
}

async function cspFor(supabaseUrl: string): Promise<string> {
  hoisted.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
  const response = await proxy(new NextRequest('https://ankora.be/'));
  const csp = response.headers.get('content-security-policy');
  expect(csp, 'CSP on the response').toBeTruthy();
  return csp ?? '';
}

beforeEach(() => {
  hoisted.seenByRouter.length = 0;
  hoisted.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';
  vi.stubEnv('NODE_ENV', 'production');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('proxy CSP — Supabase sources', () => {
  it('connect-src names the exact project host, over https and wss, and no other Supabase source', async () => {
    const csp = await cspFor('https://abcdefghijklmnopqrst.supabase.co');
    const connect = sources(csp, 'connect-src');

    expect(connect).toContain('https://abcdefghijklmnopqrst.supabase.co');
    expect(connect).toContain('wss://abcdefghijklmnopqrst.supabase.co');
    const supabaseSources = connect.filter((source) => source.includes('supabase'));
    expect(supabaseSources.sort()).toEqual([
      'https://abcdefghijklmnopqrst.supabase.co',
      'wss://abcdefghijklmnopqrst.supabase.co',
    ]);
  });

  it('img-src carries no Supabase source', async () => {
    const csp = await cspFor('https://abcdefghijklmnopqrst.supabase.co');

    expect(sources(csp, 'img-src')).toEqual(["'self'", 'data:', 'blob:']);
  });

  it('contains no wildcard anywhere in production', async () => {
    const csp = await cspFor('https://abcdefghijklmnopqrst.supabase.co');

    expect(csp).not.toContain('*');
  });

  it('follows a local http stack with the matching ws scheme', async () => {
    const csp = await cspFor('http://127.0.0.1:54421');
    const connect = sources(csp, 'connect-src');

    expect(connect).toContain('http://127.0.0.1:54421');
    expect(connect).toContain('ws://127.0.0.1:54421');
    expect(connect.some((source) => source.includes('supabase'))).toBe(false);
  });

  it('keeps the origin only when the URL carries a path or a trailing slash', async () => {
    const csp = await cspFor('https://abcdefghijklmnopqrst.supabase.co/some/path/');
    const connect = sources(csp, 'connect-src');

    expect(connect).toContain('https://abcdefghijklmnopqrst.supabase.co');
    expect(connect).toContain('wss://abcdefghijklmnopqrst.supabase.co');
    expect(csp).not.toContain('/some/path');
  });
});

describe('proxy CSP — malformed Supabase URL', () => {
  it.each([
    ['a directive separator', 'https://abcdefghijklmnopqrst.supabase.co;script-src'],
    ['a non-http scheme', 'ftp://abcdefghijklmnopqrst.supabase.co'],
  ])('fails closed on %s instead of writing it into the header', async (_label, url) => {
    hoisted.env.NEXT_PUBLIC_SUPABASE_URL = url;

    await expect(proxy(new NextRequest('https://ankora.be/'))).rejects.toThrow(
      'NEXT_PUBLIC_SUPABASE_URL is not a plain http(s) host',
    );
  });
});

describe('proxy CSP — ordering invariant', () => {
  it('puts nonce, CSP and pathname on the request BEFORE i18n routing runs', async () => {
    const response = await proxy(new NextRequest('https://ankora.be/fr-BE/app'));

    expect(hoisted.seenByRouter).toHaveLength(1);
    const seen = hoisted.seenByRouter[0]!;
    expect(seen.nonce, 'nonce visible to the router').toBeTruthy();
    expect(seen.path).toBe('/fr-BE/app');
    expect(seen.csp, 'CSP visible to the router').toBe(
      response.headers.get('content-security-policy'),
    );
    expect(sources(seen.csp ?? '', 'script-src')).toContain(`'nonce-${seen.nonce}'`);
  });
});
