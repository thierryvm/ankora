import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildClientErrorReport,
  routeTemplate,
  sendClientErrorReport,
} from '../client-error-report';

describe('routeTemplate — the shape of the page, never its identifiers', () => {
  it.each([
    ['/', '/'],
    ['/app', '/app'],
    ['/en/app/charges', '/en/app/charges'],
    ['/app/accounts/3f2b8c1e-9d4a-4b7e-8f21-0a1b2c3d4e5f', '/app/accounts/:id'],
    ['/app/charges/42/edit', '/app/charges/:id/edit'],
    ['/app/x/AbCdEf0123456789AbCdEf0123', '/app/x/:id'],
    ['/app/charges?period=2026-09&token=abc', '/app/charges'],
    ['/app/charges#frag', '/app/charges'],
    ['/app/caf%C3%A9', '/app/:seg'],
  ])('%s → %s', (input, expected) => {
    expect(routeTemplate(input)).toBe(expected);
  });

  it('caps the length so a pathological path cannot fill the report', () => {
    const long = '/app/' + Array.from({ length: 60 }, () => 'abc').join('/');
    expect(routeTemplate(long).length).toBeLessThanOrEqual(120);
  });
});

describe('buildClientErrorReport — nothing the user wrote, nothing the error said', () => {
  it('keeps the name only when it is a known one, and never the message', () => {
    const error = Object.assign(new Error('Montant 505 € refusé pour Alice'), {
      name: 'ChunkLoadError',
    });
    const report = buildClientErrorReport(error, {
      source: 'boundary',
      pathname: '/app',
      build: 'dpl_ABC123',
    });
    expect(report).toEqual({
      source: 'boundary',
      name: 'ChunkLoadError',
      route: '/app',
      build: 'dpl_ABC123',
      skew: true,
    });
    expect(JSON.stringify(report)).not.toMatch(/505|Alice|Montant/);
  });

  it('maps an unknown name to Other and passes a well-formed digest through', () => {
    const error = Object.assign(new Error('x'), { name: 'Alice705Error', digest: '1234567890' });
    const report = buildClientErrorReport(error, {
      source: 'global',
      pathname: '/',
      build: 'local',
    });
    expect(report.name).toBe('Other');
    expect(report.digest).toBe('1234567890');
    expect(report.skew).toBe(false);
  });

  it('drops a digest that does not look like one', () => {
    const error = Object.assign(new Error('x'), { digest: 'alice@example.test 705 €' });
    const report = buildClientErrorReport(error, {
      source: 'boundary',
      pathname: '/',
      build: 'local',
    });
    expect(report).not.toHaveProperty('digest');
  });
});

describe('sendClientErrorReport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the report as JSON with sendBeacon to the dedicated route', async () => {
    const beacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    const report = {
      source: 'boundary',
      name: 'Error',
      route: '/app',
      build: 'local',
      skew: false,
    } as const;
    sendClientErrorReport(report);
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, body] = beacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe('/api/client-error');
    // A CORS-safelisted type: some engines refuse sendBeacon with an
    // application/json Blob, and the report would then be dropped silently.
    expect(body.type).toBe('text/plain;charset=utf-8');
    expect(JSON.parse(await body.text())).toEqual(report);
  });

  it('never throws when sendBeacon is missing or throws', () => {
    vi.stubGlobal('navigator', {});
    expect(() =>
      sendClientErrorReport({
        source: 'global',
        name: 'Error',
        route: '/',
        build: 'local',
        skew: false,
      }),
    ).not.toThrow();
    vi.stubGlobal('navigator', {
      sendBeacon: () => {
        throw new Error('blocked');
      },
    });
    expect(() =>
      sendClientErrorReport({
        source: 'global',
        name: 'Error',
        route: '/',
        build: 'local',
        skew: false,
      }),
    ).not.toThrow();
  });
});
