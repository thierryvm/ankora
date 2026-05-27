import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUserMock = vi.fn();
const createClientMock = vi.fn(async () => ({
  auth: {
    getUser: () => getUserMock(),
  },
}));

const logWarnMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}));

// 503-diag (2026-05-27): the helper now imports `@/lib/log` to emit
// observation traces. Stub it minimally so the test runner doesn't have
// to parse `@/lib/env` (which fails without Supabase env vars in test
// context) AND so we can assert the instrumentation triggers on the right
// branches.
vi.mock('@/lib/log', () => ({
  log: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: logWarnMock,
    error: logErrorMock,
    fatal: vi.fn(),
    child: vi.fn(),
  },
}));

import { getOptionalUser } from '../require-user';

const fakeUser = {
  id: 'user-123',
  email: 'thierry@example.test',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  getUserMock.mockReset();
  createClientMock.mockClear();
  logWarnMock.mockReset();
  logErrorMock.mockReset();
});

describe('getOptionalUser() — non-redirecting session check', () => {
  it('returns null when supabase reports no user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const result = await getOptionalUser();

    expect(result).toBeNull();
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it('returns null when supabase returns an auth error', async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthApiError', message: 'JWT expired', status: 401 },
    });

    const result = await getOptionalUser();

    expect(result).toBeNull();
  });

  it('returns the user when session is valid', async () => {
    getUserMock.mockResolvedValue({ data: { user: fakeUser }, error: null });

    const result = await getOptionalUser();

    expect(result).toEqual(fakeUser);
  });

  it('swallows transient Supabase failures and resolves to null', async () => {
    // Defensive — if Supabase throws (network blip, JWT secret rotation,
    // transient DB outage), the helper degrades to anonymous chrome rather
    // than bubbling the error up to the public layout. Public surfaces
    // must always render.
    getUserMock.mockRejectedValueOnce(new Error('Network down'));

    await expect(getOptionalUser()).resolves.toBeNull();
  });
});

// 503-diag (2026-05-27): instrumentation contract — every silent failure
// path in the auth helpers MUST emit a `[503-diag]` log line so Cowork can
// filter Vercel runtime logs and identify which branch produced the 503.
// These assertions lock the contract; if a future refactor drops a log,
// the suite fails loudly.
describe('getOptionalUser() — 503-diag instrumentation contract', () => {
  it('emits [503-diag] warn when supabase returns an auth error (silent null path)', async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthApiError', message: 'JWT expired', status: 401 },
    });

    await getOptionalUser();

    expect(logWarnMock).toHaveBeenCalledTimes(1);
    const [msg, bindings] = logWarnMock.mock.calls[0] ?? [];
    expect(msg).toContain('[503-diag]');
    expect(msg).toContain('getOptionalUser');
    expect(bindings).toMatchObject({ status: 401, msg: 'JWT expired' });
  });

  it('emits [503-diag] warn with stack details when getUser() throws', async () => {
    const thrown = new Error('Network down');
    getUserMock.mockRejectedValueOnce(thrown);

    await getOptionalUser();

    expect(logWarnMock).toHaveBeenCalledTimes(1);
    const [msg, bindings] = logWarnMock.mock.calls[0] ?? [];
    expect(msg).toContain('[503-diag]');
    expect(msg).toContain('caught throw');
    expect(bindings).toMatchObject({ name: 'Error', msg: 'Network down' });
    // Stack is captured so Cowork can identify where the throw originated.
    expect(bindings).toHaveProperty('stack');
  });

  it('does NOT emit any [503-diag] log when the session is valid (no noise in nominal path)', async () => {
    getUserMock.mockResolvedValue({ data: { user: fakeUser }, error: null });

    await getOptionalUser();

    expect(logWarnMock).not.toHaveBeenCalled();
    expect(logErrorMock).not.toHaveBeenCalled();
  });
});
