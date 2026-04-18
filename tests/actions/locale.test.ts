import { describe, it, expect, vi, beforeEach } from 'vitest';

const cookieSet = vi.fn();
const userUpdate = vi.fn();
const supabaseUpdate = vi.fn(() => ({ eq: vi.fn() }));

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: cookieSet }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-123' } } }) },
    from: () => ({ update: supabaseUpdate }),
  }),
}));

beforeEach(() => {
  cookieSet.mockClear();
  userUpdate.mockClear();
  supabaseUpdate.mockClear();
  supabaseUpdate.mockImplementation(() => ({ eq: userUpdate }));
});

describe('setLocaleAction', () => {
  it('rejects an unsupported locale', async () => {
    const { setLocaleAction } = await import('@/lib/actions/locale');
    const res = await setLocaleAction('pt-PT');
    expect(res.ok).toBe(false);
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it('writes NEXT_LOCALE cookie for a supported locale', async () => {
    const { setLocaleAction } = await import('@/lib/actions/locale');
    const res = await setLocaleAction('nl-BE');
    expect(res.ok).toBe(true);
    expect(cookieSet).toHaveBeenCalledWith(
      'NEXT_LOCALE',
      'nl-BE',
      expect.objectContaining({ sameSite: 'lax', path: '/' }),
    );
  });

  it('updates users.locale when the user is authenticated', async () => {
    const { setLocaleAction } = await import('@/lib/actions/locale');
    await setLocaleAction('en');
    expect(supabaseUpdate).toHaveBeenCalledWith({ locale: 'en' });
    expect(userUpdate).toHaveBeenCalledWith('id', 'user-123');
  });
});
