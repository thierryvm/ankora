import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireUserMock = vi.fn();
const rateLimitMock = vi.fn();
const logAuditEventMock = vi.fn();
const redirectMock = vi.fn((_path?: string): never => {
  throw new Error('NEXT_REDIRECT');
});
const notFoundMock = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
const headersMock = vi.fn();
const adminUserIdsRef = { value: '' };

vi.mock('next/headers', () => ({
  headers: async () => headersMock(),
}));

vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirectMock(path),
  notFound: () => notFoundMock(),
}));

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => requireUserMock(),
}));

vi.mock('@/lib/security/rate-limit', () => ({
  rateLimit: async (...args: unknown[]) => rateLimitMock(...args),
}));

vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: {
    ADMIN_ACCESS_GRANTED: 'admin.access.granted',
    ADMIN_ACCESS_DENIED: 'admin.access.denied',
    ADMIN_ACCESS_RATE_LIMITED: 'admin.access.rate_limited',
  },
  logAuditEvent: async (...args: unknown[]) => logAuditEventMock(...args),
}));

vi.mock('@/lib/env', () => ({
  env: {
    get ANKORA_ADMIN_USER_IDS() {
      return adminUserIdsRef.value;
    },
  },
}));

import { requireAdmin } from '../require-admin';

beforeEach(() => {
  requireUserMock.mockReset();
  rateLimitMock.mockReset();
  logAuditEventMock.mockReset();
  redirectMock.mockClear();
  notFoundMock.mockClear();
  headersMock.mockReset();
  adminUserIdsRef.value = '';

  // Default: rate limit allows
  rateLimitMock.mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 });
  // Default: headers with mock IP + UA
  const fakeHeaders = new Map<string, string>([
    ['x-forwarded-for', '203.0.113.42, 10.0.0.1'],
    ['user-agent', 'Mozilla/5.0 (test)'],
    ['x-pathname', '/fr-BE/admin'],
  ]);
  headersMock.mockResolvedValue({
    get: (name: string) => fakeHeaders.get(name.toLowerCase()) ?? null,
  });
});

describe('requireAdmin() — rate-limited + audit-logged guard', () => {
  it('rate limit exceeded → notFound() + audit admin.access.rate_limited', async () => {
    rateLimitMock.mockResolvedValue({
      success: false,
      reason: 'rate_limited',
      limit: 10,
      remaining: 0,
      reset: 60,
    });

    await expect(requireAdmin()).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(logAuditEventMock).toHaveBeenCalledOnce();
    expect(logAuditEventMock).toHaveBeenCalledWith(
      'admin.access.rate_limited',
      expect.objectContaining({
        userId: null,
        ipAddress: '203.0.113.42',
        userAgent: 'Mozilla/5.0 (test)',
      }),
      expect.objectContaining({ path: '/fr-BE/admin' }),
    );
    // requireUser not even called — choke point worked
    expect(requireUserMock).not.toHaveBeenCalled();
  });

  it('rate limit OK + non-admin user → audit denied + redirect /app', async () => {
    requireUserMock.mockResolvedValue({ id: 'user-not-admin' });
    adminUserIdsRef.value = 'user-thierry';

    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith('/app');
    // Per security-auditor P1-B + gdpr P1, attempted_user_id is no longer
    // duplicated into metadata — canonical `userId` column carries it.
    expect(logAuditEventMock).toHaveBeenCalledWith(
      'admin.access.denied',
      expect.objectContaining({
        userId: 'user-not-admin',
        ipAddress: '203.0.113.42',
      }),
      expect.objectContaining({ path: '/fr-BE/admin' }),
    );
    const metadataArg = logAuditEventMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(metadataArg).not.toHaveProperty('attempted_user_id');
  });

  it('rate limit OK + admin user → audit granted + returns user', async () => {
    const adminUser = { id: 'user-thierry', email: 'thierry@ankora.test' };
    requireUserMock.mockResolvedValue(adminUser);
    adminUserIdsRef.value = 'user-thierry';

    const result = await requireAdmin();

    expect(result).toBe(adminUser);
    expect(redirectMock).not.toHaveBeenCalled();
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).toHaveBeenCalledWith(
      'admin.access.granted',
      expect.objectContaining({
        userId: 'user-thierry',
        ipAddress: '203.0.113.42',
      }),
      expect.objectContaining({ path: '/fr-BE/admin' }),
    );
  });

  it('uses x-real-ip when x-forwarded-for is absent', async () => {
    const fakeHeaders = new Map<string, string>([
      ['x-real-ip', '198.51.100.7'],
      ['user-agent', 'curl/8.0'],
    ]);
    headersMock.mockResolvedValue({
      get: (name: string) => fakeHeaders.get(name.toLowerCase()) ?? null,
    });
    rateLimitMock.mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: 60,
    });

    await expect(requireAdmin()).rejects.toThrow('NEXT_NOT_FOUND');

    expect(rateLimitMock).toHaveBeenCalledWith('admin', 'ip:198.51.100.7');
  });

  it('falls back to ip:anon when no IP header is present', async () => {
    const fakeHeaders = new Map<string, string>([['user-agent', 'unknown']]);
    headersMock.mockResolvedValue({
      get: (name: string) => fakeHeaders.get(name.toLowerCase()) ?? null,
    });
    rateLimitMock.mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: 60,
    });

    await expect(requireAdmin()).rejects.toThrow('NEXT_NOT_FOUND');

    expect(rateLimitMock).toHaveBeenCalledWith('admin', 'ip:anon');
  });
});
