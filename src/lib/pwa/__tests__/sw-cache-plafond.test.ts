import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

/**
 * Tour 58 ter, point 8 — the worker's static cache grew with every build:
 * `_next/static/` chunks are content-hashed, so each deploy adds new keys, and
 * `activate` only purges when `sw.js` itself changes. Nothing ever removed
 * the chunks of a build no page references any more.
 *
 * `public/sw.js` is a classic worker and cannot be imported. As in
 * `is-bypass.test.ts`, the SHIPPED source is read; here the trimming function
 * is evaluated in an isolated context (our own file, no network, no globals)
 * and driven with an in-memory Cache that keeps insertion order, like the
 * Cache API does.
 */
const SW = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');

function extract(): {
  trim: (cache: FakeCache, max: number) => Promise<void>;
  max: number;
  version: string;
} {
  const fn = SW.match(/async function trimBuildAssets\([\s\S]*?\n}\n/);
  const re = SW.match(/const BUILD_ASSET = (\/[^\n]*\/);/);
  const max = SW.match(/const MAX_BUILD_ASSETS = (\d+);/);
  const version = SW.match(/const CACHE_VERSION = '([^']+)';/);
  if (!fn || !re || !max || !version) throw new Error('sw.js: trimming code not found');
  const context: Record<string, unknown> = { URL };
  runInNewContext(`const BUILD_ASSET = ${re[1]};\n${fn[0]}\nthis.trim = trimBuildAssets;`, context);
  return {
    trim: context.trim as (cache: FakeCache, max: number) => Promise<void>,
    max: Number(max[1]),
    version: version[1]!,
  };
}

/** Cache API subset, insertion-ordered; `put` of an existing key moves it last. */
class FakeCache {
  private readonly entries: string[] = [];
  async put(url: string) {
    const i = this.entries.indexOf(url);
    if (i >= 0) this.entries.splice(i, 1);
    this.entries.push(url);
  }
  async keys() {
    return this.entries.map((url) => ({ url }));
  }
  async delete(req: { url: string }) {
    const i = this.entries.indexOf(req.url);
    if (i < 0) return false;
    this.entries.splice(i, 1);
    return true;
  }
  list() {
    return [...this.entries];
  }
}

const ORIGIN = 'https://ankora.test';
const PRECACHE = [
  '/manifest.webmanifest',
  '/icon.svg',
  '/apple-icon.svg',
  '/brand/logo.svg',
  '/offline',
];
const chunk = (build: number, i: number) => `${ORIGIN}/_next/static/chunks/b${build}-${i}.js`;

describe('public/sw.js — the static cache stays bounded across builds (point 8)', () => {
  it('three builds of 100 chunks: at most MAX build assets kept, the newest build whole, the offline shell untouched', async () => {
    const { trim, max } = extract();
    const cache = new FakeCache();
    for (const p of PRECACHE) await cache.put(`${ORIGIN}${p}`);
    for (let b = 1; b <= 3; b++) {
      for (let i = 0; i < 100; i++) {
        await cache.put(chunk(b, i));
        await trim(cache, max);
      }
    }
    const kept = cache.list();
    const chunks = kept.filter((u) => u.includes('/_next/static/'));
    // Before the fix nothing was trimmed: 300 chunks for three builds.
    expect(chunks.length).toBe(max);
    expect(max).toBeLessThan(300);
    for (let i = 0; i < 100; i++) expect(kept).toContain(chunk(3, i));
    expect(kept).not.toContain(chunk(1, 0));
    for (const p of PRECACHE) expect(kept).toContain(`${ORIGIN}${p}`);
  });

  it('below the cap, nothing is removed', async () => {
    const { trim } = extract();
    const cache = new FakeCache();
    for (let i = 0; i < 10; i++) await cache.put(chunk(1, i));
    await trim(cache, 50);
    expect(cache.list()).toHaveLength(10);
  });

  it('the cache version moved, so activation purges what older builds piled up', () => {
    const { version } = extract();
    expect(version).not.toBe('ankora-v5-20260805');
  });
});
