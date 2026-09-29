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

vi.mock('@/lib/env', () => ({ env: { NODE_ENV: 'test' }, clientEnv: {} }));
// Only the limiter is replaced: identifierFromRequest stays real, so the key
// format asserted below is the production one.
vi.mock('@/lib/security/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security/rate-limit')>()),
  rateLimit: rateLimitSpy,
}));
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
    expect(rateLimitSpy).toHaveBeenCalledWith('api', 'client-error:ip:203.0.113.7');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message, fields] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe('client_error_reported');
    const { build: _build, ...rest } = valid;
    expect(fields).toMatchObject({ ...rest, clientBuild: 'dpl_OLD' });
    expect(fields).toHaveProperty('serverBuild');
    expect(fields).not.toHaveProperty('build');
  });

  // Cross-site forgery: a third-party page could post fake reports from each
  // of its visitors' IPs, bypassing the per-IP limit and spending Upstash
  // commands. Refused BEFORE the limiter, so forged traffic costs nothing.
  it.each<[string, Record<string, string>]>([
    ['a cross-site fetch', { 'sec-fetch-site': 'cross-site' }],
    ['a same-site but other-origin fetch', { 'sec-fetch-site': 'same-site' }],
    ['a foreign Origin', { origin: 'https://evil.example', host: 'localhost' }],
  ])('refuses %s with 403, before the limiter', async (_label, headers) => {
    const res = await POST(req(JSON.stringify(valid), headers));
    expect(res.status).toBe(403);
    expect(rateLimitSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('accepts a same-origin beacon (Sec-Fetch-Site and Origin matching the host)', async () => {
    const res = await POST(
      req(JSON.stringify(valid), {
        'sec-fetch-site': 'same-origin',
        origin: 'http://localhost',
        host: 'localhost',
        'content-type': 'text/plain;charset=UTF-8',
      }),
    );
    expect(res.status).toBe(204);
  });

  it('enforces the cap on a body streamed in several chunks', async () => {
    const encoder = new TextEncoder();
    const piece = encoder.encode('a'.repeat(400));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 4; i += 1) controller.enqueue(piece);
        controller.close();
      },
    });
    const request = new Request('http://localhost/api/client-error', {
      method: 'POST',
      body: stream,
      // @ts-expect-error -- undici needs it for a stream body; not in lib.dom's RequestInit
      duplex: 'half',
    });
    const res = await POST(request);
    expect(res.status).toBe(413);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('refuses invalid UTF-8 with 400', async () => {
    const request = new Request('http://localhost/api/client-error', {
      method: 'POST',
      body: new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]),
    });
    const res = await POST(request);
    expect(res.status).toBe(400);
  });

  it('refuses a __proto__ key like any unknown field', async () => {
    const res = await POST(req(`{"__proto__":{"x":1},${JSON.stringify(valid).slice(1)}`));
    expect(res.status).toBe(400);
    expect(warnSpy).not.toHaveBeenCalled();
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
