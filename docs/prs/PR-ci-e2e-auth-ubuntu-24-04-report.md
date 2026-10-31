# PR report — pin the authenticated e2e runner to Ubuntu 24.04

@cc-ankora → @thierry — 31 October 2026.

## Why

`Playwright E2E (authenticated)` is a required check on `main`, and it failed on every PR from
30 October 2026. First seen on PR #534 (run 41138893869):

```
Failed to install browsers
Error: ERROR: Playwright does not support chromium on ubuntu26.04-x64
```

`ubuntu-latest` moved to Ubuntu 26.04. The authenticated job runs without a container, because
`supabase start` needs the Docker daemon (see the comment on the job), so it inherited 26.04. The
public `Playwright E2E` job runs in `mcr.microsoft.com/playwright:v1.59.1-noble` (24.04) and passes.

No PR can merge while this check is red: this one has to land first, before the dependency
security PRs that follow it.

## Change

One line in `.github/workflows/ci.yml`, job `e2e-authenticated`:
`runs-on: ubuntu-latest` → `runs-on: ubuntu-24.04`, with a comment saying why and when to unpin.

## What this does not do

- **The pin is temporary.** GitHub will retire the 24.04 image eventually. The real fix is upgrading
  Playwright to a release that supports 26.04, tracked in #535.
- The Playwright cache key holds `runner.os`, not the image version, so it does not tell images
  apart. Browsers restored on 24.04 stay compatible; noted in #535.
- The other `ubuntu-latest` jobs (quality, security, migrations guard, Lighthouse) pass today and are
  left untouched.
- Upgrading Playwright is a dependency change, out of scope here.

## Plan review

Part of the dependency security plan reviewed by `plan-reviewer` (v3: 🟡 approved with changes,
applied). Workflow change: human review by @thierry required (CLAUDE.md, banned list #3).

## DoD

| Criterion                                            | Proof                        |
| ---------------------------------------------------- | ---------------------------- |
| CI green, including `Playwright E2E (authenticated)` | to fill from the PR's checks |
| Sourcery and Codex threads handled                   | to fill                      |
| @thierry's review                                    | pending                      |
| No conflict with `main`                              | to fill (`mergeStateStatus`) |
| This report                                          | this file                    |
