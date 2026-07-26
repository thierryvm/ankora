#!/usr/bin/env node
/**
 * CLI over `scripts/lib/auth-specs.mjs`, used by the `e2e-authenticated` CI job.
 *
 *   node scripts/e2e-auth-specs.mjs --check   # verify discovery vs the committed list
 *   node scripts/e2e-auth-specs.mjs --list    # print the spec paths, one per line
 *
 * `--check` runs BEFORE Playwright in CI. A drift caught here costs seconds; the
 * same drift caught by nobody costs a shrinking suite that still reports green.
 */
import { resolveAuthSpecs, EXPECTED_LIST_PATH } from './lib/auth-specs.mjs';

const wantsList = process.argv.includes('--list');

try {
  const specs = resolveAuthSpecs();
  if (wantsList) {
    console.log(specs.join('\n'));
  } else {
    console.log(`✅ ${specs.length} authenticated specs, matching ${EXPECTED_LIST_PATH}.`);
  }
  // Not process.exit(): it aborts Node on Windows while sockets are still open,
  // and an exit code you cannot trust is worse than no gate at all.
  process.exitCode = 0;
} catch (error) {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
