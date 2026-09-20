import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `exportUserData` now throws when a table cannot be read, instead of exporting
 * it empty. The action is where that throw must stop: the person gets a
 * translated message, not an error boundary, and the rows never reach the log.
 */

const { exportSpy, logErrorSpy } = vi.hoisted(() => ({
  exportSpy: vi.fn(),
  logErrorSpy: vi.fn(),
}));

// `@/lib/log` imports `@/lib/env`, which parses the whole environment at import
// time and throws in the `quality` job (no Supabase, no secrets).
vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_APP_ENV: 'development',
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    INTERNAL_SECRET: 'a'.repeat(32),
  },
  clientEnv: {
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_APP_ENV: 'development',
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'a@b.test' } } }) },
  }),
}));

vi.mock('next/headers', () => ({
  headers: async () => new Map([['user-agent', 'vitest']]),
}));

vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: { GDPR_EXPORT_REQUESTED: 'gdpr.export_requested' },
  logAuditEvent: vi.fn(),
}));

vi.mock('@/lib/security/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ success: true, limit: 1, remaining: 0 })),
}));
vi.mock('@/lib/actions/revalidate', () => ({ revalidateAppPath: vi.fn() }));
vi.mock('@/lib/gdpr/export', () => ({ exportUserData: exportSpy }));
vi.mock('@/lib/gdpr/deletion', () => ({
  requestDeletion: vi.fn(),
  cancelDeletion: vi.fn(),
  retryDeletion: vi.fn(),
}));
vi.mock('@/lib/log', () => ({
  log: { error: logErrorSpy, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { exportMyDataAction } from '../settings';

beforeEach(() => {
  exportSpy.mockReset();
  logErrorSpy.mockClear();
});

describe('exportMyDataAction', () => {
  it('returns a translated error when a table cannot be read', async () => {
    exportSpy.mockRejectedValue(
      new Error('GDPR export: reading commitments failed', { cause: { message: 'secret detail' } }),
    );

    const res = await exportMyDataAction();

    expect(res).toEqual({ ok: false, errorCode: 'errors.settings.exportFailed' });
    // The log carries the table name, never the PostgREST detail.
    expect(logErrorSpy).toHaveBeenCalledWith('GDPR export failed', {
      user_id: 'user-1',
      reason: 'GDPR export: reading commitments failed',
    });
    expect(JSON.stringify(logErrorSpy.mock.calls)).not.toContain('secret detail');
  });

  it('still hands out the file when every read succeeds', async () => {
    exportSpy.mockResolvedValue({ schemaVersion: '1.1', charges: [] });

    const res = await exportMyDataAction();

    expect(res.ok).toBe(true);
    if (res.ok) expect(JSON.parse(res.data.payload)).toEqual({ schemaVersion: '1.1', charges: [] });
  });
});
