#!/usr/bin/env node
/**
 * Run the AUTHENTICATED Playwright specs locally against a real Supabase.
 *
 * Why this exists: CI cannot run them. `.github/workflows/ci.yml` falls back to
 * dummy Supabase values (the `E2E_*` secrets are deliberately unset — the only
 * Supabase project is production, and a `service_role` key must never live in
 * CI), so every spec guarded by `test.skip(!admin, …)` silently skips. That is
 * 13 of 30 specs — i.e. every authenticated journey. This script closes that gap
 * on the developer machine, reproducibly, instead of hand-rolling env exports.
 *
 * Safety model:
 *  - Credentials are read from `.env.local` into this process only. They are
 *    never printed, never passed on a command line, never sent to a browser.
 *  - The specs seed an EPHEMERAL user (`ankora-e2e+<random>@ankora.test`) and
 *    delete it in a `finally` block. Verified 2026-07-25: zero orphans in prod.
 *  - It targets the project configured in `.env.local` — today that is
 *    PRODUCTION. The banner below makes that explicit before anything runs, so
 *    it is always a deliberate act. Refuses to run in CI.
 *
 * Fidelity: runs against the PRODUCTION build (`npm run start`), exactly like CI
 * — not `npm run dev`. The dev server compiles a Server Action on its first
 * invocation, which overruns assertion timeouts and fails authenticated specs
 * for no real reason (observed 2026-07-25: the save button still read
 * « Enregistrement… » after 5 s). A validation tool that cries wolf gets ignored.
 *
 * ⚠️ RATE LIMIT — why a filter is mandatory. Each spec performs a real login,
 * and `rateLimit('auth', …)` is keyed **by IP** at 5 attempts / 15 minutes
 * (`src/lib/security/rate-limit.ts`, `src/lib/actions/auth.ts`). Running all 13
 * authenticated specs at once therefore locks itself out from the 6th login on —
 * verified 2026-07-25 ("Service temporairement indisponible"). This is the rate
 * limiter working correctly, not a bug. So: validate the 1-3 specs your change
 * actually touches. `--all` exists for the rare full sweep and warns first.
 *
 * Usage:
 *   npm run e2e:auth -- accounts         # specs matching "accounts" (the norm)
 *   npm run e2e:auth -- charges expenses # several filters
 *   npm run e2e:auth -- --all            # every auth spec (expect rate-limit hits)
 *   npm run e2e:auth -- accounts --headed --skip-build
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const ENV_FILE = '.env.local';
/** Keys the seeded specs need; `adminClientOrNull()` returns null without them. */
const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

if (process.env.CI) {
  console.error('✖ e2e:auth is a local-only tool — it must never run in CI.');
  process.exit(1);
}

if (!existsSync(ENV_FILE)) {
  console.error(`✖ ${ENV_FILE} not found — cannot reach a real Supabase.`);
  process.exit(1);
}

// Minimal .env parser: `KEY=value`, ignoring comments/blank lines and stripping
// surrounding quotes. No dependency (budget 0 €), no value ever logged.
const parseEnv = (raw) =>
  Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith('#'))
      .map((line) => {
        const eq = line.indexOf('=');
        if (eq === -1) return null;
        const key = line.slice(0, eq).trim();
        const value = line
          .slice(eq + 1)
          .trim()
          .replace(/^["']|["']$/g, '');
        return [key, value];
      })
      .filter(Boolean),
  );

const fileEnv = parseEnv(readFileSync(ENV_FILE, 'utf8'));
const missing = REQUIRED.filter((k) => !fileEnv[k]);
if (missing.length > 0) {
  console.error(`✖ ${ENV_FILE} is missing: ${missing.join(', ')}`);
  process.exit(1);
}

/**
 * Path to npm's own CLI script, so it can be launched with `node` instead of
 * spawning `npm.cmd` (same Windows EINVAL / DEP0190 reasoning as Playwright
 * below). npm sets `npm_execpath` for every script it runs.
 */
function npmCli() {
  const fromNpm = process.env.npm_execpath;
  if (fromNpm && fromNpm.endsWith('.js')) return fromNpm;
  console.error('✖ Run this through npm (`npm run e2e:auth`) — npm_execpath is unset.');
  process.exit(1);
}

/** Every spec that seeds a user — detected, not hard-coded, so it can't drift. */
function findAuthSpecs(dir = 'e2e', found = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      findAuthSpecs(path, found);
    } else if (
      entry.endsWith('.spec.ts') &&
      readFileSync(path, 'utf8').includes('adminClientOrNull')
    ) {
      found.push(path.replace(/\\/g, '/'));
    }
  }
  return found;
}

const OWN_FLAGS = ['--skip-build', '--all'];
const passthrough = process.argv.slice(2).filter((a) => !OWN_FLAGS.includes(a));
const skipBuild = process.argv.includes('--skip-build');
const runAll = process.argv.includes('--all');
// A bare word (no leading dash) narrows the run; anything else goes to Playwright.
const filters = passthrough.filter((a) => !a.startsWith('-'));
const flags = passthrough.filter((a) => a.startsWith('-'));

const allSpecs = findAuthSpecs();

// A filter is mandatory: every spec logs in, and auth is rate-limited to 5
// attempts / 15 min per IP, so an unfiltered sweep locks itself out (see header).
if (filters.length === 0 && !runAll) {
  console.error('✖ Name what you want to validate — every spec performs a real login,');
  console.error('  and auth is rate-limited to 5 attempts / 15 min per IP.\n');
  console.error('  Available authenticated specs:');
  for (const s of allSpecs) console.error(`    ${s}`);
  console.error('\n  e.g. npm run e2e:auth -- accounts        (use --all to sweep anyway)');
  process.exit(1);
}

const specs = runAll ? allSpecs : allSpecs.filter((s) => filters.some((f) => s.includes(f)));

if (specs.length === 0) {
  console.error(`✖ No authenticated spec matches: ${filters.join(', ')}`);
  process.exit(1);
}

if (specs.length > 5) {
  console.warn(
    `⚠ ${specs.length} specs = ${specs.length} logins, but auth allows 5 per 15 min per IP.\n` +
      '  Expect "Service temporairement indisponible" past the 5th — that is the\n' +
      '  rate limiter doing its job, not a regression.\n',
  );
}

// Host only — never the key. Tells the operator WHICH database is about to be
// touched, so running against production is always a conscious choice.
const host = (fileEnv.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^https?:\/\//, '');
console.log('──────────────────────────────────────────────');
console.log(' e2e:auth — authenticated specs, real Supabase');
console.log(` target : ${host}`);
console.log(` specs  : ${specs.length}`);
console.log(' server : production build (same as CI)');
console.log(' note   : seeds an ephemeral user, deleted after each spec');
console.log('──────────────────────────────────────────────');

// Production build, mirroring CI. Skipped on demand when iterating on a spec
// against an already-built app.
if (!skipBuild) {
  console.log('▸ Building (npm run build)… use --skip-build to reuse .next\n');
  const build = spawnSync(process.execPath, [npmCli(), 'run', 'build'], {
    stdio: 'inherit',
    env: { ...process.env, ...fileEnv },
  });
  if (build.status !== 0) {
    console.error('✖ Build failed — fix it before running the authenticated specs.');
    process.exit(build.status ?? 1);
  }
} else if (!existsSync('.next')) {
  console.error('✖ --skip-build passed but no .next build exists. Run without it first.');
  process.exit(1);
}

// Invoke Playwright's CLI through `node` rather than `npx`: on Windows, Node 20+
// refuses to spawn a `.cmd` without `shell: true` (EINVAL), and `shell: true`
// concatenates arguments unescaped (DEP0190 — a real injection surface for
// pass-through flags). Resolving the CLI entry point avoids both.
const playwrightCli = createRequire(import.meta.url).resolve('@playwright/test/cli');

const result = spawnSync(
  process.execPath,
  [playwrightCli, 'test', ...specs, '--project=chromium-desktop', ...flags],
  // E2E_PROD_SERVER makes playwright.config start `npm run start` (the build we
  // just produced) instead of `npm run dev` — see the comment there.
  { stdio: 'inherit', env: { ...process.env, ...fileEnv, E2E_PROD_SERVER: '1' } },
);

if (result.error) {
  console.error(`✖ Failed to launch Playwright: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
