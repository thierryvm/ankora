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
 * ## Why it cannot drift out of sync with the server
 *
 * The pending delta is **not** cleared on a timer, and **not** cleared when the
 * action resolves. It is cleared when the hero observes its server `value`
 * actually change (see `HeroAmount`). That ordering is the whole trick: clear on
 * resolve and there is a window where the delta is gone but the RSC payload has
 * not landed, so the figure jumps back up and then down again — a visible
 * flicker on the one number the product is built around.
 *
 * On failure the sheet calls {@link settleSpend} itself, which reverts the
 * delta immediately, alongside the error toast.
 *
 * ## Scope
 *
 * Only spends dated inside the current month may be announced — an expense
 * backdated to last month does not move this month's hero. That check belongs
 * to the caller, which is the only place that knows the date.
 */

let pending = 0;
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

function getSnapshot(): number {
  return pending;
}

/** Server render: nothing is pending yet, so hydration matches. */
function getServerSnapshot(): number {
  return 0;
}

/**
 * Announce a spend that has just been committed optimistically.
 *
 * @param amount euros, positive. Ignored when not finite or ≤ 0 — a zero-euro
 *   spend has nothing to show, and a NaN from a half-typed field must never
 *   reach the hero and turn it into « NaN € ».
 */
export function announceSpend(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  pending += amount;
  emit();
}

/**
 * Drop the pending delta.
 *
 * Called by the hero when fresh server truth arrives, and by the sheet when the
 * insert failed. Idempotent.
 */
export function settleSpend(): void {
  if (pending === 0) return;
  pending = 0;
  emit();
}

/** Euros committed optimistically and not yet reflected in server truth. */
export function useOptimisticSpend(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
