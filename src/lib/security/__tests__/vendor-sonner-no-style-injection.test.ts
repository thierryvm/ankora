import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Source guard on the vendored copy of `sonner`.
 *
 * Upstream `sonner` injects its stylesheet at module evaluation time through a
 * `<style>` element created without a nonce. Our CSP blocks it, and every page
 * of production logged two `style-src` violations. The stylesheet is already
 * served through `globals.css`, so the copy under `src/vendor/sonner/` drops
 * the injection. Upgrading the copy means pasting a new upstream build: this
 * test is what stops the injection from coming back with it.
 */
const VENDOR = join(process.cwd(), 'src', 'vendor', 'sonner');

function fichiers(dir: string): string[] {
  return readdirSync(dir).flatMap((nom) => {
    const chemin = join(dir, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

const FORBIDDEN = [
  '__insertCSS',
  "createElement('style')",
  'createElement("style")',
  'createElement(`style`)',
];

describe('src/vendor/sonner — no runtime style injection', () => {
  const tous = fichiers(VENDOR);
  const code = tous.filter((f) => /\.(m?js|cjs|ts|mts|tsx)$/.test(f));

  it('the vendored copy is where the guard looks', () => {
    // Fail closed: an empty or renamed folder must not turn this guard green.
    expect(code.map((f) => relative(VENDOR, f).replace(/\\/g, '/'))).toContain('index.mjs');
    expect(tous.map((f) => relative(VENDOR, f))).toContain('styles.css');
  });

  it.each(FORBIDDEN)('no file contains %s', (motif) => {
    const fautifs = code.filter((f) => readFileSync(f, 'utf8').includes(motif));
    expect(fautifs.map((f) => relative(VENDOR, f))).toEqual([]);
  });
});
