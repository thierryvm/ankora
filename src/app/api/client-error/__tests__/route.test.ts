// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A public, unauthenticated route that accepts what a browser sends. Most of
 * what follows is about refusing: unknown fields, oversized bodies, floods.
 * And about what the one accepted outcome writes — a single log line, with no
 * free text in it.
 */

const { rateLimitSpy, warnSpy } = vi.hoisted(() => ({
  rateLimitSpy: vi.fn(),
  warnSpy: vi.fn(),
}));

vi.mock('@/lib/security/rate-limit', () => ({ rateLimit: rateLimitSpy }));
vi.mock('@/lib/log', () => ({
  log: { warn: warnSpy, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { MAX_REPORT_BYTES, POST } from '../route';

const valid = {
  source: 'boundary',
  name: 'ChunkLoadError',
  route: '/app/charges',
  build: 'dpl_OLD',
  skew: true,
};

function req(body: string, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/client-error', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.7, 10.0.0.1',
      ...headers,
    },
    body,
  });
}

describe('POST /api/client-error', () => {
  beforeEach(() => {
    rateLimitSpy
      .mockReset()
      .mockResolvedValue({ success: true, limit: 60, remaining: 59, reset: 0 });
    warnSpy.mockReset();
  });

  it('accepts a valid report, answers 204 and writes exactly one log line', async () => {
    const res = await POST(req(JSON.stringify(valid)));
    expect(res.status).toBe(204);
    expect(rateLimitSpy).toHaveBeenCalledWith('api', 'client-error:203.0.113.7');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message, fields] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe('client_error_reported');
    const { build: _build, ...rest } = valid;
    expect(fields).toMatchObject({ ...rest, clientBuild: 'dpl_OLD' });
    expect(fields).toHaveProperty('serverBuild');
    expect(fields).not.toHaveProperty('build');
  });

  it('accepts a digest', async () => {
    const res = await POST(req(JSON.stringify({ ...valid, digest: '2718281828' })));
    expect(res.status).toBe(204);
    expect(warnSpy.mock.calls[0]?.[1]).toMatchObject({ digest: '2718281828' });
  });

  it.each<[string, unknown]>([
    ['an unknown field (a raw message)', { ...valid, message: 'Montant 505 € pour Alice' }],
    ['a name outside the closed list', { ...valid, name: 'Alice' }],
    ['a route with a query string', { ...valid, route: '/app?email=a@b.test' }],
    ['a route with an identifier-shaped segment kept', { ...valid, route: '/app/42' }],
    ['a free-text digest', { ...valid, digest: 'alice 705 €' }],
    ['a free-text build', { ...valid, build: 'x y' }],
    ['a missing field', { source: 'boundary', name: 'Error', route: '/', build: 'local' }],
    ['a JSON array', [valid]],
  ])('refuses %s with 400 and logs nothing', async (_label, body) => {
    const res = await POST(req(JSON.stringify(body)));
    expect(res.status).toBe(400);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON with 400', async () => {
    const res = await POST(req('{not json'));
    expect(res.status).toBe(400);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('refuses a body over the cap with 413, whatever content-length claims', async () => {
    const padded = JSON.stringify({ ...valid, route: '/' + 'a'.repeat(MAX_REPORT_BYTES) });
    const res = await POST(req(padded, { 'content-length': '10' }));
    expect(res.status).toBe(413);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('refuses early on a declared content-length over the cap', async () => {
    const res = await POST(
      req(JSON.stringify(valid), { 'content-length': String(MAX_REPORT_BYTES + 1) }),
    );
    expect(res.status).toBe(413);
    expect(rateLimitSpy).not.toHaveBeenCalled();
  });

  it('answers 429 and logs nothing when the limiter refuses', async () => {
    rateLimitSpy.mockResolvedValue({
      success: false,
      reason: 'rate_limited',
      limit: 60,
      remaining: 0,
      reset: 0,
    });
    const res = await POST(req(JSON.stringify(valid)));
    expect(res.status).toBe(429);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('checks the rate limit before reading the body', async () => {
    rateLimitSpy.mockResolvedValue({
      success: false,
      reason: 'rate_limited',
      limit: 60,
      remaining: 0,
      reset: 0,
    });
    const res = await POST(req('{not json'));
    expect(res.status).toBe(429);
  });
});
