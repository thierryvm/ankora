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

// Review of tour 66: substrings missed spacing, case and other ways to add
// a stylesheet at runtime.
const FORBIDDEN: RegExp[] = [
  /__insertCSS/,
  /createElement\s*\(\s*(['"`])style\1/i,
  /<style[\s>]/i,
  /insertAdjacentHTML/,
  /adoptedStyleSheets|new\s+CSSStyleSheet|\binsertRule\s*\(/,
];

describe('src/vendor/sonner — no runtime style injection', () => {
  const tous = fichiers(VENDOR);
  const code = tous.filter((f) => /\.(m?js|cjs|jsx|ts|mts|cts|tsx)$/.test(f));

  it('the vendored copy is where the guard looks', () => {
    // Fail closed: an empty or renamed folder must not turn this guard green.
    expect(code.map((f) => relative(VENDOR, f).replace(/\\/g, '/'))).toContain('index.mjs');
    expect(tous.map((f) => relative(VENDOR, f))).toContain('styles.css');
  });

  it.each(FORBIDDEN)('no file matches %s', (motif) => {
    const fautifs = code.filter((f) => motif.test(readFileSync(f, 'utf8')));
    expect(fautifs.map((f) => relative(VENDOR, f))).toEqual([]);
  });
});

describe('sonner — only the vendored copy can be loaded', () => {
  // The likeliest regression is not an edit of the copy but `npm i sonner`
  // and an import of the package again: the copy would stay clean and unused.
  it('package.json does not depend on sonner', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain('sonner');
  });

  it('no source file imports the sonner package', () => {
    const src = fichiers(join(process.cwd(), 'src')).filter((f) => /\.(m?[jt]sx?)$/.test(f));
    const fautifs = src.filter((f) =>
      /from\s+['"]sonner(\/[^'"]*)?['"]/.test(readFileSync(f, 'utf8')),
    );
    expect(fautifs.map((f) => relative(process.cwd(), f))).toEqual([]);
  });
});
