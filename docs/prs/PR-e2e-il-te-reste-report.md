# PR — the « Il te reste » e2e no longer depends on the month it runs in

@cc-ankora — 15 November 2026.

## Symptom

`Playwright E2E (authenticated)`, a required check on `main`, failed **on every run** on
`e2e/il-te-reste-formule.spec.ts:168`:
- 3/3 retries in runs 43710778617 and 43710772839 (15 Nov), and in run 42416007942 (7 Nov),
  all of them on docs-only PRs;
- the same spec passed on 31 October.

The error: `locator.click: Timeout 10000ms exceeded` on the button
« J’ai fait ce virement : Virement à faire vers Provisions pour tes factures ».

## Cause (read in the code, matched against the calendar)

- The spec seeds an annual bill with `dueMonth: 11`.
- The cockpit computes `plan.epargneTransferNet`: the month's provision minus the bills due
  from savings this month. It names the line « vers Provisions » only when that net is ≥ 0
  (`src/app/[locale]/app/page.tsx`, `epargneGoesToEpargne`).
- In November, the 1 800 € bill is due: the net goes negative, the line becomes
  « Virement depuis Provisions », and the button the spec clicks does not exist.
- The product is right (in its due month the bill is paid from the provisions). The spec
  was calendar-bound: green until 31 October, red for the whole of November, green again
  from December.

## Fix

The annual bill falls due **six months from the current month**
(`MOIS_ECHEANCE_ANNUELLE`). It is never the month the suite runs in, whatever the day or
the time zone. No assertion is weakened and no test is skipped. The amounts the spec checks
are still read from the page.

## Gates

| Gate | Result |
|---|---|
| eslint (file) | 0 |
| prettier | clean |
| `npm run typecheck` | 0 |
| `npm run build` | **not run locally**: this worktree links `node_modules` from the main clone, and Turbopack refuses files outside the workspace root. The change touches only an e2e spec, which is not in the app bundle; the CI build is the proof. |
| e2e floors | proven by the CI jobs of this PR (public 294, authenticated 81). Docker Desktop is not running on the workstation, so the authenticated suite cannot run locally. |

## Follow-up

Other specs hard-code `dueMonth` values (1, 3, 6) for monthly bills or for checks that do
not depend on the due month. They were not changed. They break only if a future rule makes
a bill's own due month change what the page shows.
