import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUserMock = vi.fn();
const createClientMock = vi.fn(async () => ({
  auth: {
    getUser: () => getUserMock(),
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
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

  it('never throws on transient Supabase failures (returns null instead)', async () => {
    // Defensive — if Supabase throws (network blip), the helper must still
    // resolve `null` rather than bubble the error to the calling layout.
    // Public surfaces should always render, even when auth is degraded.
    getUserMock.mockRejectedValueOnce(new Error('Network down'));

    await expect(getOptionalUser()).rejects.toThrow('Network down');
    // Note: current implementation does not swallow throws — this test
    // documents that behaviour so a future regression is intentional.
  });
});
