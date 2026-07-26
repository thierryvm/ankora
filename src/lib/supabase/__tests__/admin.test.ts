// @vitest-environment node
//
// Two reasons for the node environment, both load-bearing:
//   1. `createServiceRoleClient()` refuses to run when `window` exists, and the
//      suite default (jsdom, vitest.config.ts) defines one.
//   2. It is the environment this code actually runs in.
//
// `@/lib/env` is mocked because `src/lib/env.ts` parses `process.env` at import
// and throws when required variables are missing — which is exactly the case in
// CI, where the `quality` job declares no `env:` block. Without this the test
// would be green locally (`.env.local` is loaded) and red in CI. Eight existing
// suites mock it the same way.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// `vi.hoisted` because `vi.mock` factories are lifted above every top-level
// declaration; a plain `const` would not exist yet when the factory runs.
const { SERVICE_ROLE_KEY } = vi.hoisted(() => ({
  SERVICE_ROLE_KEY: 'service-role-key-that-is-long-enough-to-look-real',
}));

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54421',
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  },
}));

import { createServiceRoleClient } from '../admin';

function headerValue(init: RequestInit | undefined, name: string): string | undefined {
  const raw = init?.headers;
  if (!raw) return undefined;
  if (raw instanceof Headers) return raw.get(name) ?? undefined;
  const entries = Array.isArray(raw) ? raw : Object.entries(raw as Record<string, string>);
  const hit = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
  return hit?.[1];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createServiceRoleClient — H3 / issue #192 regression guard', () => {
  it('sends the service_role key as the request identity', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal('fetch', (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return Promise.resolve(
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
    });

    await createServiceRoleClient().from('audit_log').select('id');

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    // Both headers matter: `apikey` alone would still be accepted by PostgREST
    // while `Authorization` decided the role. The bug this guards against sent
    // the caller's JWT in `Authorization` while `apikey` stayed correct.
    expect(headerValue(call.init, 'apikey')).toBe(SERVICE_ROLE_KEY);
    expect(headerValue(call.init, 'Authorization')).toBe(`Bearer ${SERVICE_ROLE_KEY}`);
  });

  // The third invariant the module header states, and the only one a test can
  // pin cheaply. A module-level singleton would let auth state from one request
  // survive into the next.
  it('returns a fresh client on every call, never a shared singleton', () => {
    expect(createServiceRoleClient()).not.toBe(createServiceRoleClient());
  });

  it('refuses to run in a browser', async () => {
    vi.stubGlobal('window', {});
    expect(() => createServiceRoleClient()).toThrow(/never run in the browser/i);
  });

  // This one is a lint, not a proof of behaviour — and it is deliberately the
  // load-bearing guard for THIS regression. A unit test cannot reproduce the
  // real failure (it needs a live session cookie and a real database), but the
  // bug had exactly one shape: a service_role client built on the SSR helper.
  // Forbidding those two imports makes that shape unreachable.
  it('never imports the cookie-aware helpers', () => {
    const source = readFileSync(join(__dirname, '..', 'admin.ts'), 'utf8');
    const importLines = source
      .split('\n')
      .filter((line) => /^\s*import\s/.test(line))
      .join('\n');

    expect(importLines).not.toContain('@supabase/ssr');
    expect(importLines).not.toContain('next/headers');
  });
});
