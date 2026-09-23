# PR E2 — Dépenses (future « Opérations ») à la forme de la maquette v3

@cc-ankora — draft. Lot 7 of the plan. Refs by id only: COUVERTURE-v3 F-6, F-18 (the note of an
expense), F-20, F-34; DESIGN-v3 rule 26.

## Changed test expectations (declared first)

| Test                                                              | Before                                                       | After                                                                  | Why                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `expense-categories.test.ts` « pre-selects the first chip… »      | first chip pre-selected with no history                      | `null` with no history; new case: pre-selected once a use supports it  | F-6: a first expense fell into an arbitrary category                 |
| `AddExpenseSheet.test.tsx` « still lets the amount be recorded… » | context unreadable → recorded with `categoryId: null`        | refused on screen, action not called                                   | F-6: a category is required on screen and on the server              |
| `src/lib/actions/__tests__/expenses.test.ts` `VALID_EXPENSE`      | `categoryId: null`                                           | a uuid + the category lookup scripted                                  | same                                                                 |
| `tests/actions/expenses.test.ts`                                  | `categoryId: null`                                           | a uuid + categories mock                                               | same                                                                 |
| `e2e/mobile-ios/expenses-crud.spec.ts`                            | clicked a chip only if already loaded; `getByText` page-wide | waits for a chip and checks it; text lookups scoped to `expenses-list` | F-6 + the description now also appears in the folded month breakdown |

## Done

- **F-6** — no pre-selection until a use in the 30-day window supports it
  (`expenseCategoryChips`). « Ajouter » without a category shows a `role=alert` message and records
  nothing. Server: `expenseCreateSchema` (category required) and a lookup of the category in the
  caller's workspace, `kind = 'variable'`, before the insert.
- **Note (F-18)** — « Ajouter une note », folded; trimmed, empty → `null`. `expenses.note` existed:
  no migration.
- **F-20** — a description typed in full recalls the category of its latest expense (or the family
  of a known chain), unless the person tapped a chip in this opening.
- **Rule 26 / F-34** — the description is an ARIA 1.2 combobox placed before the categories: the
  person's descriptions first (frequency, then date), then the built-in chain list (exact spelling,
  Belgium + German border chains), six at most, start-of-word match without case or accents. The
  label stays free. Descriptions are read with the session client (RLS) on the session's workspace.
- **Page** — visible name stays « Dépenses » (pilot's decision: « Opérations » comes with the
  journal of all kinds). Path `/app/expenses` unchanged. The add button comes first; the month total
  opens by category, then by description (subtotals in cents, « Sans libellé » last, fed from the
  complete month); the list is grouped by day and shows the category under a description that
  differs from it.
- A real defect found by e2e on iPhone 14 and fixed: closing the suggestion list on blur moved the
  chips under the finger, and the tap missed. The list no longer closes on blur.

## Verified

- Gates after the last code change: typecheck ✅, lint 0 errors ✅, lint:use-server ✅,
  vitest 2903/2903 ✅, build ✅ (the only change after the build is a test-only fixture).
- `npm run dev` on a free port: `/login` 200, 0 compile error in the server output.
- New spec `e2e/expense-entry-v3.spec.ts`, local stack, 375 px, typed key by key and read back on
  screen and in the database: 2/2 passed (chromium-desktop). It covers a new account with nothing
  pre-checked, the refusal without a category (0 rows), then a save; a chain chosen among the
  suggestions + a note; the recall of a description's category against a different usage
  pre-selection; « Il te reste » lowered by the exact amount each time; the page breakdown. A second
  account does not see the first one's description, and the list does open for it on a chain, so
  the instrument works.
- Reviews: plan-reviewer 🟡 → corrections applied; code review: no finding ≥ 80; security review:
  PASS_WITH_NOTES (description and note absent from audit logs, read scoped by RLS + session
  workspace).

## Not verified

- `expenses-crud.spec.ts` (iPhone 14) after its last scoped lookup (line 119): the run just before
  it passed creation and the list check, then failed on that same duplicated-text cause. It was not
  run again after the fix (session budget). CI will run it.
- e2e floors: only the delta was measured locally. The new spec adds **+2 passed** to
  `Playwright E2E (authenticated)` (chromium-desktop; expected ≥ 83). In the public job it skips
  without a service role, so the public floor of 294 should not move. Neither full suite was run
  locally.
- RLS policy on `expenses` read in the migrations (`is_workspace_member`), not queried on a live
  database.

## To decide

- **Security S1 (medium, pre-existing)** — `updateExpenseAction` still accepts any `categoryId`
  (another workspace's, or a bill/income one). Create is now guarded; update is not. A dedicated PR
  is proposed: it touches another action and was out of this scope.
- S2 (low) — the description read ignores its `error`: a failed read shows no suggestion, silently.
