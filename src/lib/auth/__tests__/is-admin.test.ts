import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUserMock = vi.fn();
const adminUserIdsRef = { value: '' };

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => getUserMock(),
    },
  }),
}));

vi.mock('@/lib/env', () => ({
  env: {
    get ANKORA_ADMIN_USER_IDS() {
      return adminUserIdsRef.value;
    },
  },
}));

import { isAdmin } from '../is-admin';

beforeEach(() => {
  getUserMock.mockReset();
  adminUserIdsRef.value = '';
});

describe('isAdmin() — server-side admin check (fail-closed)', () => {
  it('returns false when no session (user = null)', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    adminUserIdsRef.value = 'user-uuid-thierry';
    expect(await isAdmin()).toBe(false);
  });

  it('returns false when user authenticated but not in allow-list', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-uuid-other' } } });
    adminUserIdsRef.value = 'user-uuid-thierry';
    expect(await isAdmin()).toBe(false);
  });

  it('returns true when user authenticated and in allow-list', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-uuid-thierry' } } });
    adminUserIdsRef.value = 'user-uuid-thierry';
    expect(await isAdmin()).toBe(true);
  });

  it('returns true when allow-list has multiple IDs and user matches one', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-uuid-cowork' } } });
    adminUserIdsRef.value = 'user-uuid-thierry, user-uuid-cowork , user-uuid-other';
    expect(await isAdmin()).toBe(true);
  });

  it('returns false when allow-list is empty (no magical everyone-is-admin)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-uuid-thierry' } } });
    adminUserIdsRef.value = '';
    expect(await isAdmin()).toBe(false);
  });

  it('returns false when allow-list contains only whitespace/commas', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-uuid-thierry' } } });
    adminUserIdsRef.value = '  , , ';
    expect(await isAdmin()).toBe(false);
  });

  it('fails closed if Supabase client throws', async () => {
    getUserMock.mockRejectedValue(new Error('Supabase down'));
    adminUserIdsRef.value = 'user-uuid-thierry';
    expect(await isAdmin()).toBe(false);
  });
});
