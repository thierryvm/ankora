# Plan — Lot A: fonts (ADR-049)

@cc-ankora — branch `feat/lot-a-polices` off main `2c13bed`. Spec by `spec-translator`
(15 November 2026). Version 2: rewritten after `plan-reviewer` rejected v1 (15 required
changes, R1–R15 below). Every number here was measured with a prototype of the script run
outside the repository on the pinned sources; the report pastes each command with its output.

## 0. Problem (measured 15 November 2026)

- `public/fonts/Fraunces-Variable.woff2` (33 584 B) maps 289 code points (latin-ext only): no
  a–z, B–Z, 0–9, é è à ç œ €. Every `font-display` heading renders in Inter except the letter A.
  The italic `em` of the hero H1 (`Hero.tsx:63`) and of `FooterCTA.tsx:34` has no italic file.
- `Inter-Variable.woff2` (351 352 B, Inter 4.001, `opsz`+`wght`) is not preloaded. Production
  Lighthouse mobile: /en 74, /faq 82, /glossaire 86, /login 84; LCP 3.5–4.7 s; CLS /faq 0.087.
- `JetBrainsMono-Variable.woff2` (113 820 B) has no U+202F, the fr-BE thousands separator that
  `Intl` writes into every mono amount: it falls back to another font and breaks tabular columns.
- `/fonts/:path*` is `immutable` for a year (`next.config.ts:168-171`): new bytes need new paths.

## 1. Phase 0 (blocking)

1. Pilot model Opus; branch `feat/lot-a-polices`; one session on the worktree; **no `.env.local`
   in the worktree**; `npm ci` done in the worktree (R15 — done 15 Nov., exit 0).
2. Download GO from @thierry — **given 15 Nov. 2026** in this session. Sources downloaded into
   an empty directory outside the repo; Python runs with `-I`.
3. Sources = google/fonts at commit `cc39c4c2c304bc368c9b7c311ea2bcc6013299fe`. Their sizes and
   git blob SHA-1 match the GitHub tree at that commit; SHA-256 recorded:

   | File                                                    | Bytes                 | SHA-256                     |
   | ------------------------------------------------------- | --------------------- | --------------------------- |
   | `ofl/inter/Inter[opsz,wght].ttf`                        | 876 576               | `29160a80…c559031`          |
   | `ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf`        | 360 440               | `177ff6c0…958abbb`          |
   | `ofl/fraunces/Fraunces-Italic[SOFT,WONK,opsz,wght].ttf` | 414 904               | `b24448c4…d2c0e01`          |
   | `ofl/jetbrainsmono/JetBrainsMono[wght].ttf`             | 187 208               | `48715a42…2ffeda`           |
   | three `OFL.txt`                                         | 4 377 / 4 391 / 4 399 | full hashes in `fonts.json` |

   Copyright statements: Inter Project Authors 2020, Fraunces Project Authors 2018, JetBrains
   Mono Project Authors 2020 — **none carries "with Reserved Font Name"**.

4. Tools: fonttools 4.68.0 + brotli 1.2.1, pinned with `==` in a throwaway venv, never in
   `package.json`.
5. Outbound: `work perso -NoCd && …`; `npm run preflight` before every push and `gh` write.
6. **Merge order (R13)**: #542 (ADR-049 + the programme table holding the lot A row) merges
   **before** this PR. This PR is coded and reviewed in parallel; before merge it rebases on the
   main that contains #542 and updates the lot A row. If #542 is still open when everything else
   is green, the report says so and the merge waits.

## 2. Scope

**In**

- `scripts/fonts/fonts.json` — the single source of data: source URLs, commit, git blob SHA-1
  and SHA-256 of sources; per output: path, family, style, axes, `unicode-range`, exact feature
  set, SHA-256, size budget, `preload` scope (`"layout"`, `"landing"` or `null`); required
  characters; **hand-written exceptions** (R3); tool versions.
- `scripts/fonts/build-fonts.py` — fonttools: instancer (pin axes) → reload → cmap alias →
  subset → woff2, with `recalcTimestamp=False` (R4). Reads `fonts.json`, never writes it; prints
  sizes, hashes and the characters each source lacks. Run by hand, never in CI.
- `scripts/fonts/README.md` — venv, pinned versions, exact commands, how to bump the commit,
  and the reproducibility claim (two runs, identical bytes — proved by the prototype, re-proved
  in the report).
- `scripts/fonts/woff2-inspect.ts` — dependency-free reader (`zlib.brotliDecompressSync`):
  cmap 4/12 as code point → glyph id, GSUB/GPOS features with ≥ 1 lookup, `fvar` axes, `name`,
  italic flag, `head.unitsPerEm`, `hhea`/`OS/2` vertical metrics.
- `scripts/fonts/__tests__/fonts.test.ts` with `// @vitest-environment node`.
- 8 woff2 + 3 licences, one directory per family so each `OFL.txt` sits next to its fonts:
  `public/fonts/inter/{inter-latin,inter-latin-ext}.woff2` + `OFL.txt`;
  `public/fonts/fraunces/{fraunces-latin,fraunces-latin-ext,fraunces-italic-latin,fraunces-italic-latin-ext}.woff2`
  - `OFL.txt`; `public/fonts/jetbrains-mono/{jetbrains-mono-latin,jetbrains-mono-latin-ext}.woff2`
  - `OFL.txt`. `proxy.ts:186` already excludes `.woff2` and `.txt`; `proxy-matcher.test.ts`
    walks `public/` recursively; the SW bypass is a `/fonts/` prefix.
- Delete the three `*-Variable.woff2`.
- `src/lib/fonts.ts` — `FONT_PRELOADS` (hrefs by scope) and `preloadFonts(scope)`, which calls
  `preload(href, { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' })` from `react-dom`.
  The test ties `FONT_PRELOADS` to `fonts.json`; the e2e checks the rendered `<head>`.
- `src/app/globals.css:58-90` — 8 `@font-face`, **latin-ext declared before latin** in each pair
  (R5, belt and braces with the disjoint ranges); comment rewritten, no Tailwind arbitrary class
  spelled in it.
- `src/app/[locale]/layout.tsx` — `preloadFonts('layout')`; comment at lines 27-35 updated.
- `src/app/[locale]/(public)/page.tsx` — `preloadFonts('landing')`.
- `src/app/__tests__/globals-tokens.test.ts:150-172` — swap count and old URLs rewritten against
  `fonts.json`; token assertions untouched.
- `e2e/fonts.spec.ts` (public project) — see §5. Raises the public floor; the delta is measured.
- `docs/prs/PR-lot-a-polices-report.md`; `docs/ROADMAP.md` lot A row (after #542, see Phase 0.6).

**Out**: no `--font-*` token rename; no Inter italic (`glossaire/[slug]/page.tsx:148` keeps its
synthetic italic — reported); no serif-on-figure change (`WhatIfDemoClient.tsx:290` renders an
amount in Fraunces — lot F of ADR-049); no change to `package.json`, lockfile, `.husky/`,
workflows, `next.config.ts`, `sw.js`, `proxy.ts`. Historical docs naming the old files stay.

## 3. Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Measured basis                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Two files per family-style, `latin` and `latin-ext`, **disjoint** ranges (R5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | A French page then never downloads latin-ext: `œ`, `Ÿ`, `ẞ` live in `latin`                                                                                                                                                                                                                                                                                                      |
| D2  | `latin` = `U+0000-00FF, U+0131, U+0152-0153, U+0178, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+1E9E, U+2000-206F, U+20AC, U+2122, U+2190-2195, U+2212, U+2215, U+2248, U+2260, U+2264-2265, U+2295, U+2713, U+FEFF, U+FFFD`                                                                                                                                                                                                                                                                                                     | Google Fonts latin + Ÿ and ẞ (R2) + the symbols `messages/` uses (→ 223 times; Google latin has 2191/2193, not 2192)                                                                                                                                                                                                                                                             |
| D2b | `latin-ext` = `U+0100-0130, U+0132-0151, U+0154-0177, U+0179-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9D, U+1E9F, U+1EF2-1EFF, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF`                                                                                                                                                                                                                                                                                                                    | Google latin-ext minus everything in D2; a test asserts the two are disjoint                                                                                                                                                                                                                                                                                                     |
| D3  | Inter keeps `opsz`+`wght` (accepted by plan-reviewer). Exact features: GSUB `calt ccmp locl tnum`, GPOS `kern mark mkmk`                                                                                                                                                                                                                                                                                                                                                                                                                             | `inter-latin` = **69 440 B** (wght only: 45 444 B, reported); production 351 352 B. Google's Inter has no `liga`/`clig`/`rvrn`, so v1's list was wrong                                                                                                                                                                                                                           |
| D4  | Fraunces (upright and italic): SOFT 0 and WONK 1 (their `fvar` defaults) and **`opsz` pinned at 36**; `wght` kept. Exact features: GSUB `liga`, GPOS `kern`                                                                                                                                                                                                                                                                                                                                                                                          | With `opsz` kept: 70 488 B upright + 85 844 B italic = 156 KB on the landing, over the 70 KB budget. Pinned: **37 160 B + 45 080 B**. 36 px is the median of the rendered display sizes (R11): mobile 28, 30, 30, 30, 36, 36, 36 ×3 (error pages), 48; desktop 36 to 60. Pinning `opsz` bakes the `rvrn` (wonky) choice into the outlines, so `rvrn` disappears from the outputs |
| D5  | JetBrains Mono: `wght` only, `calt` dropped, exact features GSUB `ccmp locl`, GPOS `mark` (no `kern` in the source, R6); U+202F → the glyph of U+00A0                                                                                                                                                                                                                                                                                                                                                                                                | The 54-line `font-mono` grep shows letters (labels, TOTP secret, `<code>`), so letters stay. Same advance in a monospace font: the alias keeps columns aligned. 21 084 B + 13 316 B                                                                                                                                                                                              |
| D6  | Fraunces gets **no** U+202F alias (R7): the source has no thin space; U+00A0 there is a full 0.205 em space. U+202F is inkless, so the browser takes it from the next font in the stack, Inter, whose U+202F is the correct narrow 0.18 em                                                                                                                                                                                                                                                                                                           | Listed in the exceptions with that reason                                                                                                                                                                                                                                                                                                                                        |
| D7  | Budgets, asserted by the test (R9): `inter-latin` ≤ 80 KB, `inter-latin-ext` ≤ 130 KB, each Fraunces file ≤ 50 KB, each mono file ≤ 25 KB                                                                                                                                                                                                                                                                                                                                                                                                            | Measured sizes + ~10 % headroom                                                                                                                                                                                                                                                                                                                                                  |
| D8  | Preload: `inter-latin` from the layout; on the landing, **both** `fraunces-latin` and `fraunces-italic-latin` (R8 — the hero H1 contains the italic `em`), kept only if the preview's Lighthouse trace names the hero H1 as LCP; otherwise removed before merge and the report says why                                                                                                                                                                                                                                                              |                                                                                                                                                                                                                                                                                                                                                                                  |
| D9  | `font-display: swap` everywhere. Landing CLS measured on the preview. Above 0.05: a `Fraunces Fallback` face in this PR — `src: local('Georgia'), local('Noto Serif'), local('DejaVu Serif')`, with `size-adjust`, `ascent-override`, `descent-override` computed against Georgia (iOS, macOS, Windows); Android resolves Noto Serif with the same overrides, an approximation the report states. `--font-display` becomes `'Fraunces', 'Fraunces Fallback', 'Inter', …` (a value change, not a rename). The CSS test then expects 8 + 1 faces (R12) |                                                                                                                                                                                                                                                                                                                                                                                  |

**Exceptions (hand-written in `fonts.json`, R3)** — a required character missing from an output
fails the test unless it is listed here with a reason:

- Fraunces (upright and italic): U+202F (D6); U+2190–2195, U+2295, U+2713 — not drawn by the
  source, they fall back to Inter, which has them.
- JetBrains Mono: U+2295, U+2713 — not drawn by the source; fallback to the system mono.

## 4. Steps

1. `woff2-inspect.ts` + `fonts.test.ts` first; run them red against the three production files
   (the Fraunces coverage failure is pasted into the report as the negative control).
2. `fonts.json` + `build-fonts.py`; run twice into two empty directories, compare bytes, copy
   outputs into `public/fonts/<family>/`, add the three `OFL.txt`.
3. `src/lib/fonts.ts`, layout, landing, `globals.css`, `globals-tokens.test.ts`; delete the old
   files; `e2e/fonts.spec.ts`.
4. Gates, dev, e2e floors (with and without the new spec), screenshot, PR, preview Lighthouse,
   D8/D9 decisions, report, ROADMAP after #542.

## 5. Tests

`scripts/fonts/__tests__/fonts.test.ts`:

- **Coverage**: each `latin` file maps, by itself, `[a-zA-Z0-9]`, FR `àâäæçéèêëîïôöœùûüÿ` and
  their capitals including `Ÿ`, DE `äöüßẞ` (+ capitals), ES `áéíóúñ¿¡` (+ capitals), NL `ëï`, `€`,
  U+00A0, U+202F, U+2212 and the D2 symbols — minus the listed exceptions. Each `latin-ext`
  file maps `ąćęłńśźżőűčřšžĳ` (+ capitals). Every exception must still be missing (a stale
  exception fails too).
- **Ranges**: every output's cmap ⊆ its declared range; `latin` ∩ `latin-ext` = ∅.
- **Features**: each output's feature set **equals** the one in `fonts.json` (present and
  absent: `tnum` in Inter, no `calt` in mono).
- **Alias**: in mono, U+202F and U+00A0 map to the same glyph id.
- **Axes and style**: Inter `opsz,wght`; Fraunces and mono `wght`; italic flag only on the
  Fraunces italic pair; in each pair, same `unitsPerEm`, same `hhea`/`OS/2` vertical metrics,
  same axes (no line-height jump when a latin-ext character appears).
- **Integrity**: SHA-256 of every committed woff2 equals `fonts.json`; size ≤ budget.
- **CSS**: one `@font-face` per output (+ the D9 face if added) whose `src`, `unicode-range`,
  `font-style`, `font-weight` and `font-display: swap` equal `fonts.json`; latin-ext before latin.
- **Preload**: `FONT_PRELOADS` equals the `preload` scopes in `fonts.json`; `layout.tsx` calls
  `preloadFonts('layout')` and `(public)/page.tsx` calls `preloadFonts('landing')`.
- **Licence**: each family directory has `OFL.txt`; its copyright statement (the text before
  "This Font Software is licensed") contains no "Reserved Font Name".
- Negative controls: each helper is shown failing once on a wrong input (production Fraunces, a
  synthetic missing code point, a shuffled range), recorded in the report.

`e2e/fonts.spec.ts` (public project):

- On `/`: the `<head>` holds exactly the layout + landing preloads, each with `crossorigin`;
  after `document.fonts.ready`, the `FontFace` objects for Fraunces upright and italic are
  `loaded`; `performance.getEntriesByType('resource')` holds their URLs; a canvas measure of
  the H1 text in `Fraunces` differs from the same text in `Inter` (R10 — `fonts.check` alone
  proves nothing).
- On `/faq`: only the layout preload; no Fraunces-italic request.

## 6. Risks

- Preload without `crossorigin` downloads twice; React forces `crossorigin` for `as: 'font'` —
  verified in the rendered HTML by the e2e, not assumed.
- Pinning Fraunces `opsz` changes the cut against a design that never actually rendered
  Fraunces; screenshots before/after go in the report for @thierry's iPhone pass.
- Old URLs 404 after deploy; CSS is hashed per deploy, so only a stale HTML could request them.
- Vercel previews are behind SSO: a 401/403 is not a Lighthouse measurement.
- Public repo: the report holds no local or scratchpad path and no personal data.

## 7. DoD (the five criteria of CLAUDE.md, R1)

1. CI green: Lint, Typecheck, Tests, E2E, E2E authenticated, Security, Build. Locally before
   push: `lint`, `lint:use-server`, `typecheck`, `test`, `build`; `npm run dev` with `/` and
   `/faq` loaded and their HTTP codes read, no font 404, no preload warning; e2e floors measured
   locally (public ≥ 294 + the new cases, authenticated ≥ 81); screenshot at 390 × 844 with the
   hero H1 proved in Fraunces (FontFace `loaded`, resource timing, canvas width); Lighthouse
   mobile on the preview for /, /en, /faq, /login, LCP element named, before/after.
2. Sourcery silent on the **last** commit, checked with the three `gh api` commands of
   CLAUDE.md (comments, reviews, `reviewThreads` all resolved); Codex threads handled in-thread.
3. Human review by @thierry approved and resolved.
4. No conflict with main: `mergeStateStatus` CLEAN, after the rebase on #542.
5. Report `docs/prs/PR-lot-a-polices-report.md` with the proof of each criterion and each
   measurement's command (R14).

QA agents: `test-quality-auditor`, `silent-failure-auditor`, `ui-auditor`, `mobile-ios-auditor`,
`lighthouse-auditor`, `security-auditor` (supply chain), `test-runner` — each told it modifies no
file of the repository.

## 7b. Amendments after the v2 review (🟡 APPROVED WITH CHANGES, 15 November 2026)

These override the sections above where they disagree.

1. **Budgets (C1, C2).** The "70 KB" of D4 was this plan's own first guess, not an ADR-049
   figure; it is withdrawn. Measured sizes of all eight outputs (prototype command:
   `python -I build-fonts.py` into an empty directory, then `wc -c`): `inter-latin` 69 440,
   `inter-latin-ext` 122 716, `fraunces-latin` 37 160, `fraunces-latin-ext` 30 836,
   `fraunces-italic-latin` 45 080, `fraunces-italic-latin-ext` 36 772, `jetbrains-mono-latin`
   21 084, `jetbrains-mono-latin-ext` 13 316. Tested budgets: `inter-latin` ≤ 80 KB,
   `inter-latin-ext` ≤ 135 KB, each Fraunces file ≤ 50 KB, each mono file ≤ 25 KB, and a
   **cumulative landing budget**: `inter-latin` + `fraunces-latin` + `fraunces-italic-latin` +
   `jetbrains-mono-latin` ≤ 190 KB (today the landing pays 351 + 33 + 114 = 498 KB). D4's reason
   for pinning `opsz` is the cumulative cost (156 KB for Fraunces alone with `opsz` kept, against
   82 KB pinned), not a per-file 70 KB.
2. **Canvas proof (C3).** The e2e compares `measureText` with `'600 48px Fraunces, Inter'` against
   `'600 48px Inter'`: if Fraunces is not usable the two are equal, so the assertion can fail.
   Negative control played once with the Fraunces files blocked by `page.route` and recorded in
   the report.
3. **Latin-ext never loads on French pages (C4).** On `/` and `/faq`: no `*-latin-ext.woff2` in
   resource timing; the latin-ext `FontFace` objects stay `unloaded`; the faces expected
   `loaded` are named by URL (`inter-latin` everywhere, `fraunces-latin` and
   `fraunces-italic-latin` on `/`).
4. **Floor (C5).** A public spec runs on three projects (`chromium-desktop`, `mobile-safari`,
   `mobile-chrome`): the public floor becomes 294 + 3 × N, N and the result measured locally with
   and without the spec. The authenticated floor (81) does not move.
5. **D9 vs D6 (C6).** If the fallback face is added, its `unicode-range` is the D2 latin range
   minus U+202F, U+2190-2195, U+2295 and U+2713, so those still come from Inter as D6 and the
   exceptions assume. Its `local()` names are checked against the real full or PostScript names
   on each platform before use.
6. If the landing preload is dropped (D8), the same commit sets the scope to `null` in
   `fonts.json` and updates the unit and e2e expectations.
7. Reported, not fixed: combining diacritics U+0300-036F are mostly outside the ranges, so text a
   user types in NFD falls back to another font.
8. This plan file is committed with the PR.

## 8. Smoke test for @thierry after merge

On iPhone, https://ankora.be: is the hero H1 a serif, italic emphasis included, with no visible
jump? Do amounts like `1 234,56 €` line up on `/app`, and do → and − render cleanly?
