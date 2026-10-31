# PR report — production dependency security: next 16.4.3, sharp, zod, source-map-js

@cc-ankora → @thierry — 31 October 2026.

## Why

`npm audit --audit-level=high --omit=dev` is the blocking step of the CI `Security audit` job, a
required check on `main`. Since advisories published at the end of October 2026 it fails on every PR.
Production surface before this PR (`npm audit --omit=dev` on `main`):

```
next  16.0.0 - 16.4.0       (critical)
sharp  <0.35.5              (high, librsvg)
source-map-js  1.0.0 - 1.2.1 (high)
zod  <4.6.6                 (high)
4 vulnerabilities (3 high, 1 critical)
```

## Change

| Package         | Before           | After            | How                               |
| --------------- | ---------------- | ---------------- | --------------------------------- |
| `next`          | 16.3.8 (exact)   | 16.4.3 (exact)   | dependency                        |
| `zod`           | ^4.4.3 → 4.4.3   | ^4.6.7 → 4.6.7   | dependency                        |
| `sharp`         | ^0.35.4 → 0.35.4 | ^0.35.5 → 0.35.5 | devDependency + existing override |
| `source-map-js` | 1.2.1            | 1.2.2            | new override `^1.2.2`             |

The `source-map-js` override only reaches build and dev tooling (postcss, Tailwind, jsdom): it is
here because `npm audit --omit=dev` counts it, not because the shipped app runs it.
`eslint-config-next` stays 16.2.6. `NOTICE` regenerated with `npm run notice` (three version lines);
`scripts/__tests__/generate-notice.test.ts` failed until then, as designed.

**Stacked on #536** (authenticated e2e runner pin): without it, the required authenticated e2e check
cannot pass on any PR. Merge #536 first; this PR's diff then shrinks to its own commit.

## Evidence

- `npm audit --omit=dev` after: **found 0 vulnerabilities**.
- `npm audit` (all, dev included): 41 on `main` today, 38 here. The rise since yesterday on `main`
  comes from a new `minimatch` advisory in the ESLint chain (dev only, the unfixable chain documented in
  `ci.yml`). Dev-only items are the next PR.
- Lockfile: `lockfileVersion` 3 before and after; 0 entries without `integrity` or `resolved`; no
  package added or removed; versions changed: `next`, `@next/env`, `sharp`, `source-map-js`, `zod`,
  plus 34 platform binaries (`@next/swc-*`, `@img/*`).
- Next 16.4 notes read after install (`node_modules/next/dist/docs`): only additions in 16.4.0
  (`ensureStatic`, `navigation`, `prefetch`, `next analyze export`, experimental options). No breaking
  change listed.
- `npm run lint` 0 errors (173 warnings, no source file changed), `npm run lint:use-server` ✓,
  `npm run typecheck` ✓.
- Unit tests: 268 files, **3797 tests passed**. Zod witness `partial-update-defaults.test.ts`: 17/17.
  Coverage of `src/lib/schemas`: 100 % lines and functions, 94.28 % branches (`expense.ts` and
  `workspace.ts` included).
- `npm run build`: Next.js 16.4.3, compiled successfully.
- `npm run dev` (port 3107): `/` 200, `/faq` 200, `/login` 200, `/app` 307 → login (no session).
  No compile error in the output.
- Local e2e: **not run**. CI's two e2e jobs are the witness, floors 294 / 81.

## Tooling note

The local npm (11.4.2) crashes in arborist on some installs. Lockfile edits were made with
`npx -y npm@11.21.1`, then installed with the local `npm ci`. `packageManager` declares
`npm@11.11.1`; no corepack in CI, so no effect.

## Not in this PR

- Dev-only fixes (vitest, vite, express chain, undici, …): next PR, re-cut from `main` after this one.
- `AGENTS.md`: `next dev` 16.4 now writes it at the root (`agentRules`). Left untracked; committing it
  or turning `agentRules` off is a separate decision.

## Reviews

- `plan-reviewer`: plan v1 🔴, v2 ✅, v3 🟡 (applied).
- `security-auditor`: 🟡 pass with notes, nothing blocking.
  - Zod 4.4.3 vs 4.6.7 compared on 37 behaviour cases outside the working tree. Identical: `.partial()`
    still fills defaults (so `partialWithoutDefaults` is still needed), default stripping, `strict` and
    strip modes, `flatten().fieldErrors`, `superRefine` paths, `treeifyError`, `uuid`, `email`, number
    and string limits. Two differences, both stricter: a `.strict()` object now rejects a `__proto__`
    key, and an array over its `max` fails before parsing its items (the CVE fix).
  - Next 16.4.3: no documented change for the proxy, nonce propagation, `headers()` or
    `experimental.serverActions.bodySizeLimit`.
  - After merge, check that ankora.be serves the new build.

## DoD

| Criterion                                                                      | Proof                        |
| ------------------------------------------------------------------------------ | ---------------------------- |
| CI green (Lint, Typecheck, Tests, E2E public + authenticated, Security, Build) | to fill from the PR's checks |
| Sourcery and Codex threads handled                                             | to fill                      |
| @thierry's review                                                              | pending                      |
| No conflict with `main`                                                        | to fill (`mergeStateStatus`) |
| This report                                                                    | this file                    |
