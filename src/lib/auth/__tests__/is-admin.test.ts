import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { SessionLookup } from '@/lib/auth/require-user';

const lookupSessionMock = vi.fn<() => Promise<SessionLookup>>();
const adminUserIdsRef = { value: '' };

// `isAdmin()` reads the identity through the request-memoized lookup only — the
// same one `requireUser()` and the layouts use. Nothing else is mocked from that
// module: if `isAdmin` reached for anything but `lookupSession`, the test fails.
vi.mock('@/lib/auth/require-user', () => ({
  lookupSession: () => lookupSessionMock(),
}));

vi.mock('@/lib/env', () => ({
  env: {
    get ANKORA_ADMIN_USER_IDS() {
      return adminUserIdsRef.value;
    },
  },
}));

import { isAdmin } from '../is-admin';

const signedIn = (id: string): SessionLookup =>
  ({ status: 'authenticated', user: { id } }) as unknown as SessionLookup;

beforeEach(() => {
  lookupSessionMock.mockReset();
  adminUserIdsRef.value = '';
});

describe('isAdmin() — server-side admin check (fail-closed)', () => {
  it('returns false when no session (anonymous)', async () => {
    lookupSessionMock.mockResolvedValue({ status: 'anonymous' });
    adminUserIdsRef.value = 'user-uuid-thierry';
    expect(await isAdmin()).toBe(false);
  });

  it('returns false when user authenticated but not in allow-list', async () => {
    lookupSessionMock.mockResolvedValue(signedIn('user-uuid-other'));
    adminUserIdsRef.value = 'user-uuid-thierry';
    expect(await isAdmin()).toBe(false);
  });

  it('returns false for a non-admin whose id merely contains an admin id', async () => {
    lookupSessionMock.mockResolvedValue(signedIn('user-uuid-thierry-2'));
    adminUserIdsRef.value = 'user-uuid-thierry';
    expect(await isAdmin()).toBe(false);
  });

  it('returns true when user authenticated and in allow-list', async () => {
    lookupSessionMock.mockResolvedValue(signedIn('user-uuid-thierry'));
    adminUserIdsRef.value = 'user-uuid-thierry';
    expect(await isAdmin()).toBe(true);
  });

  it('returns true when allow-list has multiple IDs and user matches one', async () => {
    lookupSessionMock.mockResolvedValue(signedIn('user-uuid-cowork'));
    adminUserIdsRef.value = 'user-uuid-thierry, user-uuid-cowork , user-uuid-other';
    expect(await isAdmin()).toBe(true);
  });

  it('returns false when allow-list is empty (no magical everyone-is-admin)', async () => {
    lookupSessionMock.mockResolvedValue(signedIn('user-uuid-thierry'));
    adminUserIdsRef.value = '';
    expect(await isAdmin()).toBe(false);
  });

  it('returns false when allow-list contains only whitespace/commas', async () => {
    lookupSessionMock.mockResolvedValue(signedIn('user-uuid-thierry'));
    adminUserIdsRef.value = '  , , ';
    expect(await isAdmin()).toBe(false);
  });

  it('returns false when the auth backend is unavailable, even for a listed id', async () => {
    lookupSessionMock.mockResolvedValue({ status: 'unavailable', cause: new Error('down') });
    adminUserIdsRef.value = 'user-uuid-thierry';
    expect(await isAdmin()).toBe(false);
  });

  it('only an authenticated lookup counts: unavailable carrying a listed user is still false', async () => {
    // Proves the status guard on its own: without it, `lookup.user.id` would be
    // read and match the allow-list.
    lookupSessionMock.mockResolvedValue({
      status: 'unavailable',
      cause: new Error('down'),
      user: { id: 'user-uuid-thierry' },
    } as unknown as SessionLookup);
    adminUserIdsRef.value = 'user-uuid-thierry';
    expect(await isAdmin()).toBe(false);
  });

  it('fails closed if the session lookup throws', async () => {
    lookupSessionMock.mockRejectedValue(new Error('Supabase down'));
    adminUserIdsRef.value = 'user-uuid-thierry';
    expect(await isAdmin()).toBe(false);
  });
});
