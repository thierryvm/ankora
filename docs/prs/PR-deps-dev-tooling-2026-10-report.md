# PR report — dev-tooling dependency advisories (October 2026)

@cc-ankora → @thierry — 31 October 2026.

## Why

After #536 (authenticated e2e runner) and #537 (production surface: next, sharp, zod,
source-map-js), the production audit is at 0. What remained came from development and CI tooling:
the 14 Dependabot alerts opened on 30 October, plus `npm audit` entries Dependabot did not list.

## Change

| Item                            | Before | After  | How                                                                       |
| ------------------------------- | ------ | ------ | ------------------------------------------------------------------------- |
| `vitest`, `@vitest/coverage-v8` | 4.1.11 | 4.1.12 | devDependencies (fixes `@vitest/mocker`)                                  |
| `vite`                          | 8.3.0  | 8.3.5  | override `^8.3.3`                                                         |
| `compression`                   | 1.8.1  | 1.8.2  | override (via `@lhci/cli`)                                                |
| `proxy-addr`                    | 2.0.7  | 2.0.8  | override (via `@lhci/cli` → express)                                      |
| `body-parser`                   | 1.20.8 | 1.20.9 | override (via express)                                                    |
| `qs`                            | 6.16.0 | 6.16.2 | override `~6.16.1` (via express; stays inside express's `~6.16.0` intent) |
| `undici`                        | 7.30.0 | 7.30.1 | override (via jsdom)                                                      |
| `fast-copy`                     | 4.0.3  | 4.3.1  | override (via pino-pretty)                                                |
| `smol-toml`                     | 1.7.1  | 1.9.1  | override (via cspell)                                                     |
| `ip-address`                    | 10.7.2 | 10.7.5 | existing override `^10.2.0` → `^10.7.4`                                   |

`NOTICE` regenerated (`npm run notice`): the two vitest lines.

### Why each override exists, and when to remove it

Overrides are global and silent: each one below names the advisory it closes and the condition
that makes it removable. Review this table at every dependency pass.

| Override              | Advisory closed                    | Remove when                                                                                             |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `vite ^8.3.3`         | six vite advisories (8.3.0–8.3.2)  | vitest's own range resolves vite ≥ 8.3.3, or vitest requires vite 9 (then this override would block it) |
| `compression ^1.8.2`  | GHSA-vc2v-76pw-4v95                | `@lhci/cli` ships compression ≥ 1.8.2                                                                   |
| `proxy-addr ^2.0.8`   | GHSA-jqcg-44mw-7w3h                | express (via `@lhci/cli`) requires ≥ 2.0.8                                                              |
| `body-parser ^1.20.9` | GHSA-27r3-jxmh-p828                | express (via `@lhci/cli`) requires ≥ 1.20.9                                                             |
| `qs ~6.16.1`          | GHSA-6pq8-jhm2-2vcw                | express / body-parser require ≥ 6.16.1                                                                  |
| `undici ^7.30.1`      | eight undici advisories (< 7.30.1) | jsdom requires ≥ 7.30.1                                                                                 |
| `fast-copy ^4.1.0`    | GHSA-jggr-w7fw-pc2j                | pino-pretty requires ≥ 4.1.0                                                                            |
| `smol-toml ^1.8.1`    | GHSA-r4xh-jqrq-34v2                | cspell requires ≥ 1.8.1                                                                                 |
| `ip-address ^10.7.4`  | GHSA-rxp7-6hxx-x8q5                | socks requires ≥ 10.7.4                                                                                 |

`npm ls` reports `@napi-rs/wasm-runtime@0.2.12` as invalid under `@tailwindcss/oxide-wasm32-wasi`:
identical on `main`, an optional WebAssembly package unused on Windows and Linux. Not introduced here.

## Evidence

- `npm audit --omit=dev`: 0 before, **0 after**.
- `npm audit` (dev included): **38 → 26**, no critical left.
- Lockfile: `lockfileVersion` 3; 0 entries without `integrity` or `resolved`; no package added or
  removed; **no version change in the production tree** (every changed entry is `dev`). Other
  changes are transitive bumps that come with vitest 4.1.12 and vite 8.3.5 (`rolldown` and its
  platform bindings, `@oxc-project/types`, `chai`, `std-env`, `tinyrainbow`).
- `npx eslint . --ignore-pattern ".claude/**"`: 0 errors, 173 warnings (same as `main`).
  `npm run lint` without the pattern reports errors **only** inside `.claude/worktrees/`, the
  checkouts of other local sessions (a generated `.next` build folder among them), not in this repo.
- `npm run lint:use-server` ✓, `npm run typecheck` ✓.
- Unit tests (`.claude/**` excluded for the same reason): 268 files, **3797 passed**.
- `npm run build` ✓ (Next.js 16.4.3). `npm run dev` (port 3107): `/` 200, `/faq` 200, `/app` 307,
  0 compile errors.
- `lhci collect --url=https://ankora.be/` (collect only, never autorun): Lighthouse 12.6.1 ran and
  produced its report, then the process exited 1 on a Windows `EPERM` while removing Chrome's
  temp folder — the same crash noted on this machine in the May 2026 perf audit. Not re-run on
  `main` to prove it identical. CI runs Lighthouse on Linux.

## Deferred, with reasons (no GitHub alert dismissed without @thierry)

- **`extract-zip`** (two alerts, no fixed version): only used by `@puppeteer/browsers` to unpack a
  downloaded browser. Lighthouse CI uses the runner's Chrome; nothing in the repo imports
  `@puppeteer/browsers`. The fix is `@lhci/cli` moving to puppeteer-core 25 (whose
  `@puppeteer/browsers` 3 drops extract-zip); forcing a major override under puppeteer-core 24 was
  refused.
- **`sprintf-js`**: GitHub withdrew the advisory. Proposed: dismiss the alert.
- **`zod@3` under `chromium-bidi`** (lhci): npm's only fix is a `@lhci/cli` downgrade. Same follow-up
  as extract-zip.
- **`minimatch` <11.0.1** (ESLint chain, advisory published 31 October): the fix is a major for
  both the 3.x and 10.x consumers; an override would likely break lint, as `ci.yml` records for
  `brace-expansion`. Exit: a dedicated PR upgrading to ESLint 10 and `eslint-config-next` 16.4
  (Next 16.4.0 notes: ESLint 10 compatibility), which must measure whether it actually removes it.

## Tooling note

The local npm (11.4.2) crashes in arborist on a vitest bump. The lockfile was regenerated with
`npx -y npm@11.21.1`, then installed with the local `npm ci`. `packageManager` declares
`npm@11.11.1`; no corepack in CI.

## Reviews

- `plan-reviewer`: plan v1 🔴, v2 ✅, v3 🟡 (applied).
- `security-auditor`: 🟡 pass with notes, nothing blocking. No override reaches production or the
  Next build (Next 16.4.3 depends on neither vite nor undici; its `compression` is vendored under
  `dist/compiled`). Deferrals sound: `ci.yml` triggers only on `push` / `pull_request` (no
  `pull_request_target`), so a fork PR runs without secrets and already controls the code it runs.
  Applied: `qs` kept inside express's tilde range; the override table above.
- **After merge**: read the first Lighthouse CI run on `main` — it is the only CI job that exercises
  the `@lhci/cli` → express / compression / qs path, and it does not run on PRs.
- Out of scope, noted by the auditor: the `lighthouse` job's `actions/checkout@v4` is not pinned to
  a SHA, unlike the other jobs.

## DoD

| Criterion                                                                      | Proof                        |
| ------------------------------------------------------------------------------ | ---------------------------- |
| CI green (Lint, Typecheck, Tests, E2E public + authenticated, Security, Build) | to fill from the PR's checks |
| Sourcery and Codex threads handled                                             | to fill                      |
| @thierry's review                                                              | pending                      |
| No conflict with `main`                                                        | to fill (`mergeStateStatus`) |
| This report                                                                    | this file                    |
