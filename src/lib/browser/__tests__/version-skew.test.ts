import { describe, expect, it } from 'vitest';

import {
  AUTO_RELOAD_KEY,
  AUTO_RELOAD_WINDOW_MS,
  isVersionSkewError,
  shouldAutoReload,
} from '../version-skew';

/**
 * A tab opened before a deployment keeps the old build's chunk manifest. On a
 * host that only serves the latest deployment, the next lazy chunk it asks for
 * no longer exists, and each engine words that failure differently. These are
 * the wordings the error boundary must recognise — and a plain bug must NOT be
 * mistaken for one, or it would be reloaded away instead of shown.
 */
describe('isVersionSkewError', () => {
  const skewed: Array<[string, Error]> = [
    ['webpack ChunkLoadError by name', Object.assign(new Error('x'), { name: 'ChunkLoadError' })],
    ['webpack JS chunk', new Error('Loading chunk 4821 failed.\n(error: /_next/static/a.js)')],
    ['webpack CSS chunk', new Error('Loading CSS chunk 77 failed.')],
    [
      'Chromium dynamic import',
      new TypeError('Failed to fetch dynamically imported module: /x.js'),
    ],
    ['WebKit dynamic import', new TypeError('Importing a module script failed.')],
    ['Firefox dynamic import', new TypeError('error loading dynamically imported module: /x.js')],
    [
      'stale Server Action id',
      new Error(
        'Failed to find Server Action "abc". This request might be from an older or newer deployment.',
      ),
    ],
  ];

  it.each(skewed)('recognises %s', (_label, error) => {
    expect(isVersionSkewError(error)).toBe(true);
  });

  it.each<[string, unknown]>([
    ['an ordinary TypeError', new TypeError("Cannot read properties of undefined (reading 'x')")],
    [
      'a server error carrying a digest',
      Object.assign(new Error('Loading chunk 1 failed'), { digest: '123' }),
    ],
    ['a non-error value', 'Loading chunk 1 failed'],
    ['null', null],
  ])('does not recognise %s', (_label, value) => {
    expect(isVersionSkewError(value)).toBe(false);
  });
});

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe('shouldAutoReload — one automatic reload, never a loop', () => {
  const NOW = 1_800_000_000_000;

  it('allows the first reload and records when it happened', () => {
    const storage = memoryStorage();
    expect(shouldAutoReload(storage, NOW)).toBe(true);
    expect(storage.data.get(AUTO_RELOAD_KEY)).toBe(String(NOW));
  });

  it('refuses a second reload inside the window', () => {
    const storage = memoryStorage();
    expect(shouldAutoReload(storage, NOW)).toBe(true);
    expect(shouldAutoReload(storage, NOW + AUTO_RELOAD_WINDOW_MS - 1)).toBe(false);
  });

  it('allows again once the window has passed (a later, separate deployment)', () => {
    const storage = memoryStorage({ [AUTO_RELOAD_KEY]: String(NOW) });
    expect(shouldAutoReload(storage, NOW + AUTO_RELOAD_WINDOW_MS)).toBe(true);
  });

  it('treats an unreadable stamp as "just reloaded" rather than looping', () => {
    const storage = memoryStorage({ [AUTO_RELOAD_KEY]: 'garbage' });
    expect(shouldAutoReload(storage, NOW)).toBe(false);
  });

  it('refuses when storage throws (private mode, quota): no guard means no reload', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(shouldAutoReload(throwing, NOW)).toBe(false);
  });

  it('refuses when the stamp cannot be written, since the next load could not see it', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(shouldAutoReload(storage, NOW)).toBe(false);
  });

  it('refuses when there is no storage at all', () => {
    expect(shouldAutoReload(null, NOW)).toBe(false);
  });
});
