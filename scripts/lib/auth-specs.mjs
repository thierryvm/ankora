/**
 * Single source of truth for "which e2e specs need a real Supabase".
 *
 * Two consumers: `scripts/e2e-auth.mjs` (local runs) and the `e2e-authenticated`
 * CI job. They must never disagree about the list, or one of them silently tests
 * less than the other.
 *
 * Detection is by CONTENT rather than by a tag. A tag is not safer — a forgotten
 * tag is exactly as silent as a renamed symbol — and it would cost an edit in
 * every spec. But content detection has three blind spots, all of which shrink
 * the list without saying so:
 *
 *   1. Indirection. This is not hypothetical: the previous predicate looked for
 *      `adminClientOrNull` only, and missed the three mobile-ios specs that go
 *      through the `seededUser` fixture instead. `npm run e2e:auth -- --all` had
 *      been quietly skipping them since they were written.
 *   2. Renaming. Rename `seededUser` and the job shrinks, green.
 *   3. False positives — a comment mentioning the symbol. Costs time, not truth.
 *
 * So the list is committed (`e2e/authenticated-specs.json`) and verified on every
 * run. Divergence in EITHER direction fails. Adding a spec is one line in a JSON
 * file; losing coverage without noticing is what this prevents.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Symbols that prove a spec seeds a user, directly or through a fixture. */
const SEED_MARKERS = ['adminClientOrNull', 'seededUser'];

/**
 * Specs that need a real Supabase but seed nothing, so no marker can find them.
 * `auth.spec.ts` drives signup / login / forgot-password against live GoTrue —
 * including the anti-enumeration case, which needs a real password-reset round
 * trip. Run against a placeholder Supabase it fails rather than skips.
 */
const NAMED_INCLUSIONS = ['e2e/auth.spec.ts'];

export const EXPECTED_LIST_PATH = 'e2e/authenticated-specs.json';

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      walk(path, found);
    } else if (entry.endsWith('.spec.ts')) {
      found.push(path.replace(/\\/g, '/'));
    }
  }
  return found;
}

/** Discovered specs, sorted, with the named inclusions merged in. */
export function discoverAuthSpecs(root = 'e2e') {
  const discovered = walk(root).filter((path) => {
    const source = readFileSync(path, 'utf8');
    return SEED_MARKERS.some((marker) => source.includes(marker));
  });
  return [...new Set([...discovered, ...NAMED_INCLUSIONS])].sort();
}

/** The committed list. */
export function readExpectedSpecs() {
  const raw = JSON.parse(readFileSync(EXPECTED_LIST_PATH, 'utf8'));
  return [...raw.specs].sort();
}

/**
 * Compares discovery against the committed list. Returns the spec list on
 * agreement; throws a message naming both sides on divergence.
 */
export function resolveAuthSpecs() {
  const discovered = discoverAuthSpecs();
  const expected = readExpectedSpecs();

  const missing = expected.filter((s) => !discovered.includes(s));
  const unexpected = discovered.filter((s) => !expected.includes(s));

  if (missing.length > 0 || unexpected.length > 0) {
    const lines = [
      `Authenticated spec selection diverges from ${EXPECTED_LIST_PATH}.`,
      `  expected ${expected.length}, discovered ${discovered.length}`,
    ];
    if (missing.length > 0) {
      lines.push(
        '  NO LONGER DISCOVERED (coverage would shrink silently — a renamed',
        '  fixture, a deleted spec, or a new layer of indirection):',
        ...missing.map((s) => `    - ${s}`),
      );
    }
    if (unexpected.length > 0) {
      lines.push(
        '  NEWLY DISCOVERED (add it to the committed list to accept it):',
        ...unexpected.map((s) => `    + ${s}`),
      );
    }
    throw new Error(lines.join('\n'));
  }

  return discovered;
}
