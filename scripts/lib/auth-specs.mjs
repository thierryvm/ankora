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
 * ## Blind spot 1 happened a SECOND time — 2026-08-24
 *
 * The first fix widened a list of literals: `adminClientOrNull` gained
 * `seededUser`. Two specs then drifted past the new literal exactly as they had
 * past the old one, because they name their helpers differently:
 *
 *   - `e2e/mobile-ios/dashboard.spec.ts` seeds via `seedUserWithCharges`. Every
 *     one of its cases is `test.skip(!admin)`, so it skipped in the public job
 *     AND was never selected for the authenticated one. It had never executed
 *     anywhere — including the check that no element overflows the viewport
 *     horizontally, which is the whole reason the file exists.
 *   - `e2e/mobile-ios/auth-flow.spec.ts` seeds via `seedOnboardedUser` inside a
 *     dynamic import. Its other cases DO run publicly; the one that never ran is
 *     the session-persistence regression from 2026-05-04.
 *
 * Note that `deleteSeededUser` does not contain `seededUser` — the capital S
 * defeats a substring test. That is the shape of the whole defect: a literal
 * matches the name someone happened to choose, not the thing being named.
 *
 * So the predicate is now a PATTERN over the seeding verb rather than a list of
 * names. It still cannot see through arbitrary indirection — nothing content
 * based can — but it no longer breaks on the next helper called
 * `seedUserWithSomething`. Widening the list a third time would have fixed this
 * pair and left the class untouched.
 *
 * ## Which is why the list is committed, and not merely computed
 *
 * No predicate over file contents will ever be airtight — the two occurrences
 * above are the proof, not the exception. `e2e/authenticated-specs.json` is
 * therefore the backstop: discovery is compared against it on every run and
 * diverging in EITHER direction fails. Adding a spec is one line in a JSON file;
 * losing coverage without noticing is what this prevents.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Proof that a spec seeds a user, directly or through a fixture.
 *
 * `seed\w*User` covers the whole family in one rule — `seedUser`, `seededUser`,
 * `seedOnboardedUser`, `seedUserWithCharges`, and whatever the next one is
 * called. Case matters: it is what keeps `deleteSeededUser` from qualifying a
 * spec on its own, which is right — deleting a user is cleanup, seeding one is
 * the dependency on a real Supabase.
 */
const SEED_PATTERN = /seed\w*User|adminClientOrNull/;

/**
 * Exported so the rule itself is testable, not just its result on today's tree.
 * A test that asserts "this particular file is discovered" passes forever once
 * the file is listed; one that asserts "a spec calling `seedAnythingUser` is
 * discovered" is the one that catches the next drift.
 */
export function needsRealSupabase(source) {
  return SEED_PATTERN.test(source);
}

/**
 * Specs that need a real Supabase but seed nothing, so no marker can find them.
 * `auth.spec.ts` drives signup / login / forgot-password against live GoTrue —
 * including the anti-enumeration case, which needs a real password-reset round
 * trip. Run against a placeholder Supabase it fails rather than skips.
 */
const NAMED_INCLUSIONS = ['e2e/auth.spec.ts'];

export const EXPECTED_LIST_PATH = 'e2e/authenticated-specs.json';

/**
 * Quarantined specs are still DISCOVERED and still verified against the
 * committed list — they are simply not run yet, each with a written reason.
 *
 * This is deliberately not `test.skip` inside the spec files. A skip is invisible
 * in a report that says "passed"; a quarantine list is printed on every run, with
 * its reason, and shrinks in public.
 */

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
  const discovered = walk(root).filter((path) => needsRealSupabase(readFileSync(path, 'utf8')));
  return [...new Set([...discovered, ...NAMED_INCLUSIONS])].sort();
}

/** The committed list — every authenticated spec, quarantined or not. */
export function readExpectedSpecs() {
  const raw = JSON.parse(readFileSync(EXPECTED_LIST_PATH, 'utf8'));
  return [...raw.specs].sort();
}

/** `{ path: reason }` for specs that are known-broken and not run yet. */
export function readQuarantine() {
  const raw = JSON.parse(readFileSync(EXPECTED_LIST_PATH, 'utf8'));
  return raw.quarantine ?? {};
}

/**
 * Compares discovery against the committed list. Returns the specs to RUN
 * (quarantine removed) on agreement; throws a message naming both sides on
 * divergence. Quarantined specs stay inside the comparison, so removing one
 * without updating the list is still caught.
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

  const quarantine = readQuarantine();
  return discovered.filter((spec) => !(spec in quarantine));
}
