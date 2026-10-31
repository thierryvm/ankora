# PR report — charge drawer tests: wait for the sheet's first focus before typing

@cc-ankora → @thierry — 31 October 2026.

## Why

`ChargeEditDrawer.payment.test.tsx`, case « adds nothing when there is no payment this month », failed
once in CI on #537 (run 41189853415, job « Lint + Typecheck + Unit Tests », attempt 1) and passed on
rerun with the same code:

```
expect(element).toHaveValue(705)
Expected the element to have value: 705
Received:
 ❯ correctAmountTo  ChargeEditDrawer.payment.test.tsx:56
```

A flaky test never counts as green, so it gets its own PR.

## Cause (measured, not assumed)

`Sheet` (`src/components/primitives/Sheet.tsx`) puts its initial focus on the panel's first field —
here the **label** input — inside a `requestAnimationFrame`, one frame after opening (on iOS, focusing a
still-off-screen input makes the layout viewport chase it). Under jsdom that frame is a wall-clock
timer. The test helper typed straight after `render`, so it raced that frame:

- frame due **before** `user.type` clicks the amount field → harmless (the click takes focus back);
- frame due **between that click and the first key** → focus jumps to the label field, the keys go
  there, the amount keeps the empty value `user.clear` left.

Evidence, from throwaway probes (not committed):

1. **Timeline** (8 warm runs, real timers): the frame fires ~29 ms after `render`, **0.1 ms after
   `user.clear` resolves** and ~15 ms before `user.type`'s click. Locally it always lands in the
   harmless gap, which is why the file passed 6/6 every time here.
2. **Forced interleaving**: holding the frame until `user.type`'s click reproduces the CI failure
   exactly — amount `""`, label `"Assurance habitation705"`, focus on the label field.
3. The component writes no amount in an effect, and the field is never remounted: the `field`
   reference is not stale. The hypothesis of a re-render resetting the value is ruled out by (2).

`src/components/primitives/__tests__/Sheet.test.tsx` already documents this race in its header and
fakes `requestAnimationFrame` synchronously for that reason; the drawer's tests did neither.

Not a product defect: the frame fires before the sheet is first painted, so no person can tap a field
before it. The test now waits for the moment a person waits for.

## Failure rate, before and after

| Measure                                                                        | Before                           | After           |
| ------------------------------------------------------------------------------ | -------------------------------- | --------------- |
| Sweep: frame delayed 0–60 ms in 2 ms steps, 4 runs each (124 runs), run 1      | **39/124** (every delay ≥ 32 ms) | **0/124**       |
| Same sweep, run 2 (final code)                                                 | **30/124** (delays ≥ 44 ms)      | **0/124**       |
| Natural load: CPU saturated, 8 parallel loops × 6 runs of the file (288 cases) | 0/288                            | —               |
| New regression case, mutant without the wait / final code (10 runs each)       | **10/10 red**                    | **10/10 green** |

The natural-load run never reproduced it on this machine: the timeline shows why (here the frame
always comes due during `user.clear`). The sweep moves the frame instead of the machine, and covers
the window CI hit.

## Change (tests only, no production code)

- `tests/helpers/sheet.ts` — new `waitForSheetFocus()`: waits until the dialog contains
  `document.activeElement`, i.e. the sheet's first frame has landed. Documented with the cause.
- `ChargeEditDrawer.payment.test.tsx` — `correctAmountTo` calls it before touching the amount field,
  so all six cases sharing the helper are covered. New case « types the amount into the amount field
  even when the drawer's first frame comes late »: the frame is held until `user.type` clicks the
  amount field (capped at 200 ms so the waiting helper is never left hanging), then the action must
  receive `label: 'Assurance habitation', amount: 705`. Fails 10/10 without the wait.
- `ChargeEditDrawer.amount.test.tsx` — same race in `typeAmount` (same drawer, same pattern): same wait.

No assertion weakened, no retry, no skip, no timeout raised.

## Gates

- `npm run lint`: 0 errors (26 warnings, none in the changed files); `npm run lint:use-server` ✓;
  `npm run typecheck` ✓; Prettier ✓ on the changed files.
- `npm run test`: 268 files, **3797 passed, 1 failed** — `tests/tooling/depot-public-sans-budget-reel.test.ts`
  « no scanned tracked file quotes a marker » **timed out** at 5 s on this Windows machine (it hashes
  every tracked file). Not a marker hit: rerun alone with a 60 s timeout, 6/6 passed, with the new
  helper file tracked too. It passed in CI on #537; local slowness, left out of this PR's scope.
- `ChargeEditDrawer.payment.test.tsx`: 7/7, ten consecutive runs.
- `npm run build` (env from the main clone, loaded into the process, no file written): Next.js 16.4.3,
  compiled successfully, 165/165 static pages.
- `npm run dev` (port 3117): `/` 200, `/login` 200, `/faq` 200, `/fr-BE/app/charges` 307 → login (no
  session). No compile error in the output.
- `test-quality-auditor`: **PASS WITH GAPS**. No assertion weakened; the helper cannot pass before the
  frame (no `autoFocus` in the drawer) and cannot hang (`waitFor` fails in about 1 s); the regression
  case fails for the right reason and leaks nothing (listener and spies restored in `finally`, leftover
  200 ms timers flush an empty map). Gaps: an `autoFocus` field would satisfy the helper early — now
  written in its JSDoc; the amount file has no dedicated regression case (covered by the helper only,
  judged acceptable); other exposed suites, below.
- e2e: not affected (unit tests only); CI's two e2e jobs are the witness, floors 294 / 81.

## Follow-up (not in this PR)

Other suites render a `Sheet` and type into a field that is not the sheet's initial focus target,
with neither a rAF stub nor a wait — same latent race. Each is a one-line `await waitForSheetFocus()`.

- **Exposed**: `src/components/charges/__tests__/ConvertChargeSheet.amount.test.tsx` — the sheet's
  first field is the instalment count, the tests type into the balance first.
- **Probably weaker**: `CommitmentsClient.test.tsx` and `ChargesClient.test.tsx` type into « Description »
  first, likely the first field (not verified); only a later field could be hit.
- **To check**: `AddExpenseSheet.test.tsx` focuses the amount via `initialFocusRef`, so typing the amount
  first is safe; a first interaction on another field (the date, around line 440) is not.
