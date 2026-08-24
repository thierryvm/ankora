'use client';

import { useSyncExternalStore } from 'react';

/**
 * The bridge that makes the hero move in under 100 ms (ADR-010).
 *
 * ## The problem it solves
 *
 * `SituationDuMoisHero` is a Server Component: « Il te reste » is server truth,
 * and it refreshes when `revalidateDashboard()` sends a new RSC payload after
 * the insert. Correct, but a round-trip late — and ADR-010 is explicit that the
 * figure must move *before* the server answers, or the screen feels like an
 * administrative form rather than a cockpit. That ADR reaches for
 * `useOptimistic`, which works inside one component tree; here the writer (the
 * ⊕ sheet, portalled out of the tab bar) and the reader (the hero, inside the
 * page) share no ancestor other than the locale layout.
 *
 * So: a module-level store, deliberately tiny, with one job — carry a pending
 * spend from the sheet to the hero.
 *
 * ## An absolute target, not a delta — and why that matters
 *
 * The first version of this published a delta, and the hero computed
 * `value − pending`. That is wrong in a way only a test caught: when the
 * revalidated server value lands, it ALREADY includes the spend, so for one
 * committed render the hero showed `429,89 − 18,50 = 411,39`. The figure dipped
 * 18 € below the truth and climbed back — on the one number the product is
 * built around. Reconciling that needed the component to track which server
 * value the delta belonged to, which meant reading a ref during render.
 *
 * Publishing the **resulting figure** removes the problem instead of managing
 * it. The sheet already knows it — it is the « Il te restera 429,89 € » it
 * displays. Applying it twice is applying it once: the operation is idempotent,
 * so no ordering between the action resolving and the RSC payload arriving can
 * produce a wrong frame.
 *
 * The hero clears it whenever fresh server truth arrives, unconditionally. In
 * the normal path the two agree and nothing moves. If the sheet's figure was
 * stale (another device spent meanwhile), there is one frame of the optimistic
 * value before the correction — which is precisely what optimism means.
 *
 * On failure the sheet calls {@link settleSpend} itself, reverting immediately
 * alongside the error toast.
 *
 * ## Scope
 *
 * Only a spend dated inside the current month may be announced — an expense
 * backdated to last month does not move this month's hero. That check belongs
 * to the caller, the only place that knows the date.
 *
 * ## A COUPLE of figures, published together — and never separately
 *
 * The cockpit refonte put a curve of the month next to the figure. A curve
 * frozen beside a number that moves is the exact disease `month-situation.ts`
 * describes: two readings of one month disagreeing on screen.
 *
 * Three ways out were available. Recalculating « Dépensé ce mois » on the
 * client was refused — a second computation of the same sum at display time is
 * what `CLAUDE.md` rule 10 forbids, and it is how the two would eventually
 * drift apart. Leaving the curve frozen was refused too. So the store carries
 * **both resulting figures at once**.
 *
 * That they travel as ONE object is the whole point: one `emit`, one
 * {@link settleSpend}, and no representable state in which one has been purged
 * and the other has not. A pair of scalars would have made that bug possible;
 * this makes it unspellable.
 *
 * The idempotence argument above survives unchanged — both members are
 * resulting figures, so applying them twice is applying them once.
 */

/** The two figures the screen must agree on, published as one. */
export type OptimisticSpend = {
  /** « Il te reste » once the spend is counted. */
  ilTeReste: number;
  /** « Dépensé ce mois » once the spend is counted. */
  depensesDuMois: number;
};

let pending: OptimisticSpend | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The stored object itself, never a fresh one.
 *
 * `useSyncExternalStore` compares snapshots by reference: rebuilding the object
 * here would return a new identity on every render and spin the component in an
 * infinite loop. That is why {@link announceOptimisticSpend} normalises once, on
 * write, rather than here on read.
 */
function getSnapshot(): OptimisticSpend | null {
  return pending;
}

/** Server render: nothing is pending yet, so hydration matches. */
function getServerSnapshot(): OptimisticSpend | null {
  return null;
}

/**
 * Announce what the screen should show now that a spend has been committed
 * optimistically.
 *
 * @param next the RESULTING figures, not the amount spent. Ignored unless BOTH
 *   are finite — a NaN from a half-typed field must never reach the hero and
 *   turn it into « NaN € », and a couple half-rejected would leave the number
 *   and the curve disagreeing, which is the one thing this store exists to
 *   prevent.
 */
export function announceOptimisticSpend(next: OptimisticSpend): void {
  if (!Number.isFinite(next.ilTeReste) || !Number.isFinite(next.depensesDuMois)) return;
  // Copied rather than stored by reference: the caller keeps its own object and
  // could mutate it later, which would change what subscribers read WITHOUT an
  // `emit` — a silent divergence, and unattributable when it surfaces.
  pending = { ilTeReste: next.ilTeReste, depensesDuMois: next.depensesDuMois };
  emit();
}

/**
 * Drop the optimistic figures and fall back to server truth.
 *
 * Called by the hero whenever a fresh server value arrives, and by the sheet
 * when the insert failed. Idempotent, and it clears BOTH members or neither —
 * there is no call that purges one.
 */
export function settleSpend(): void {
  if (pending === null) return;
  pending = null;
  emit();
}

/**
 * The optimistic figures to show, or `null` when server truth should be used.
 */
export function useOptimisticSpend(): OptimisticSpend | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
