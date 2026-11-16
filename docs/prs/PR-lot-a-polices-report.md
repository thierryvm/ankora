# PR report — Lot A: fonts (ADR-049)

@cc-ankora → @thierry — PR #545, branch `feat/lot-a-polices`. Plan:
[`docs/plans/lot-a-polices-plan.md`](../plans/lot-a-polices-plan.md) (spec-translator, then
plan-reviewer: v1 🔴 with 15 changes, v2 🟡 with 6, all applied). Download of the font sources
approved by @thierry on 15 November 2026.

## What was wrong (measured 15 November 2026)

Command: `node scripts/fonts/woff2-inspect.ts`-based probe on the production files, compared
with `fonts.json`'s `required.latin` (138 characters).

| Production file                            | Finding                                                                                                                                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Fraunces-Variable.woff2` (33 584 B)       | 289 code points, latin-ext only: **134 of the 138 required latin characters missing** (no a–z, no digit, no é à ç œ €). Every display heading rendered in Inter except the letter A; the hero italic had no file |
| `Inter-Variable.woff2` (351 352 B)         | full Inter 4.001, never preloaded                                                                                                                                                                                |
| `JetBrainsMono-Variable.woff2` (113 820 B) | no U+202F, the fr-BE thousands separator: mono amounts mixed two fonts                                                                                                                                           |

## What changed

- `scripts/fonts/`
  - `fonts.json`: google/fonts pinned at `cc39c4c`; each source's size, git blob SHA-1 and
    SHA-256; disjoint `latin` and `latin-ext` ranges; for each output, its exact features,
    axes, budget, preload scope, size and SHA-256; hand-written exceptions, each with its reason.
  - `build-fonts.py`: fonttools 4.68.0 and brotli 1.2.1, both versions verified. Each source is
    read once and its hash checked. The output is written atomically, under content-hashed
    names, and two runs give identical bytes.
  - `README.md`: how to rebuild.
  - `woff2-inspect.ts`: a WOFF2 reader with no dependency, built on `node:zlib`.
- `public/fonts/<family>/`: 8 subsets, plus each family's `OFL.txt` (unmodified, SHA-256 checked).

  | Output                                           | Bytes   |
  | ------------------------------------------------ | ------- |
  | `inter-latin` (opsz + wght)                      | 69 440  |
  | `inter-latin-ext`                                | 130 100 |
  | `fraunces-latin` (opsz pinned at 36)             | 37 160  |
  | `fraunces-latin-ext`                             | 30 908  |
  | `fraunces-italic-latin`                          | 45 080  |
  | `fraunces-italic-latin-ext`                      | 37 072  |
  | `jetbrains-mono-latin` (no `calt`, U+202F alias) | 21 084  |
  | `jetbrains-mono-latin-ext`                       | 15 152  |

- `globals.css`: 8 `@font-face`, printed by `build-fonts.py --print-css`.
- `src/lib/fonts.tsx` + layout: one `<link rel="preload" as="font" type="font/woff2"
crossorigin>` for Inter latin.
- Tests: `scripts/fonts/__tests__/fonts.test.ts` (unit) and `e2e/fonts.spec.ts` (browser).

## Decisions taken during the work, with their measurements

1. **No Fraunces preload on the landing** (plan D8). Lighthouse mobile, local production build,
   two runs each:
   - The LCP element of `/` is the intro paragraph, which renders in Inter, not the Fraunces H1.
   - With the Fraunces preload, that LCP took 4.05–4.11 s. Without it, 3.91–3.94 s. The score was
     84–86 both ways, and CLS 0 both ways.
2. **Preload as rendered `<link>`, not `react-dom`'s `preload()`.** Measured in dev: from a Server
   Component, `preload()` only reaches the RSC payload as a hint (`:HL[...]`). The `<link>` then
   appears after the payload script runs, which is too late to help.
3. **Fraunces pinned at opsz 36.** Keeping the axis costs 70 + 86 KB for the two latin faces;
   pinned, they cost 37 + 45 KB. 36 px is the median of the rendered display sizes.
4. **Fraunces gets no U+202F alias.** The source has no thin space, and its U+00A0 is a full
   0.205 em. U+202F has no ink, so the browser takes it from Inter (0.18 em), which is the
   correct width.
5. **The metric-override fallback face (plan D9) is not added.** It was conditional on a landing
   CLS above 0.05; the measured CLS is 0.

## Proof per Definition of Done criterion

### 1. Gates and CI

Local, on the merged branch (`a7cf21d`):

| Gate                      | Result                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run lint`            | 0 errors (26 warnings, all pre-existing on main)                                                            |
| `npm run lint:use-server` | OK                                                                                                          |
| `npm run typecheck`       | exit 0                                                                                                      |
| `npm run test`            | 273 files, 3 940 tests passed                                                                               |
| `next build`              | compiled, every route listed                                                                                |
| `npm run dev`             | `/` → 200, `/faq` → 200; `/fonts/inter/…woff2` → 200 `font/woff2`; preload `<link>` present inside `<head>` |

**DOM at 390 × 844** (Playwright, `getComputedStyle` + FontFace + resource timing):

- The H1 computes `font-family: Fraunces, Inter, …`, 28 px, weight 600, and the `em` computes
  `italic`.
- Loaded faces: Inter normal, Fraunces normal, Fraunces italic, JetBrains Mono normal.
- Font requests: only the four latin files.
- Canvas width of the H1 text: 1 036.4 px in Fraunces against 1 030.4 px in Inter.

**Negative controls**

- With the Fraunces files blocked by `page.route`, the canvas test fails: the two widths come out
  equal (1 737.48 on desktop, 1 030.44 on mobile-chrome).
- The `loaded` assertion also fails, with status `error`.
- The coverage helper fails on the old production Fraunces (134 characters missing).

**E2E floors**

- Public, measured locally on the production build:
  - with the new spec: 310 passed;
  - the new spec contributes 4 tests × 3 projects = **12** cases, and passes 36/36 in
    `--repeat-each=3`.
  - One local failure, `consent-first-visit` on mobile-safari, passed on rerun. It also fails on a
    local build of `main` and passes against ankora.be, so the cause is the local environment
    (the login shows « Service temporairement indisponible » without a real Upstash).
- Authenticated: measured by the CI job (the local `e2e:auth` targets production). See the CI
  section of the PR conversation.

**First CI run** (`f11c3dd`):

- Unit tests: `ChargeEditDrawer.payment.test.tsx` failed. This is the focus race fixed by #540,
  unrelated to this change; it is green after merging main.
- E2E: the canvas test failed on mobile-chrome, because `document.fonts.ready` had settled before
  Fraunces loaded. Fixed by loading both faces explicitly.

**Lighthouse mobile**, before and after under the same conditions: a local production build,
default mobile emulation, two runs each. The Vercel preview answers 302 (SSO), and a bypass token
never goes into a URL.

| Page     | Score before → after | LCP before → after | CLS before → after | Font bytes before → after |
| -------- | -------------------- | ------------------ | ------------------ | ------------------------- |
| `/`      | 71 → 84–85           | 5.4 s → 3.9 s      | 0.007 → 0          | 501 KB → 176 KB           |
| `/en`    | 70 → 84–85           | 5.4 s → 3.9 s      | 0.046 → 0          | 501 KB → 176 KB           |
| `/faq`   | 77 → 92              | 4.5 s → 3.3 s      | 0.087 → 0          | 352 KB → 70 KB            |
| `/login` | 79–80 → 93           | 4.4 s → 3.2 s      | 0.006 → 0          | 352 KB → 70 KB            |

Production Lighthouse is re-measured after merge on ankora.be, the only public URL.

### 2. Sourcery and Codex

Sourcery opened 7 threads on `f11c3dd`. Each was answered in its thread and resolved:

- 6 fixed in `62110f0`: content-hashed file names; combining diacritics in latin-ext; brotli
  version checked; sources read once; atomic output; README.
- 1 declined with its reason: keep the old font URLs. Next reloads the document on the first
  navigation after a deploy, so the only effect is a self-healing fallback.

Codex: none at the time of writing.

### 3. Human review

Pending: @thierry.

### 4. No conflict with main

`main` was merged into the branch (`a7cf21d`). **#542 (ADR-049 and the lot A row of the
ROADMAP) is still open.** The plan's merge order puts #542 first. This PR updates the lot A row
after #542 merges, then the merge state is re-read.

### 5. This report

## Left out, noted

- Inter keeps a synthetic italic on `glossaire/[slug]` (no Inter italic file).
- `WhatIfDemoClient` sets an amount in Fraunces (lot F: no serif on a figure).
- Arrows, ⊕ and ✓ are not drawn by Fraunces and fall back to Inter. ✓ and ⊕ are not drawn by
  JetBrains Mono and fall back to the system monospace.

## Smoke test for @thierry after merge

On iPhone, https://ankora.be:

- Is the hero title a serif, italic emphasis included, with no visible jump?
- On `/app`, do amounts such as `1 234,56 €` line up, and do → and − render cleanly?
