import type { ChargeFrequency } from '@/lib/domain/types';

/**
 * Derive the canonical `payment_months[]` schedule for a charge from its
 * frequency + due-month anchor. Pure function.
 *
 * Why this exists: PR-D1 introduced `payment_months[]` as the precise
 * schedule, but the existing ChargesClient form only ever submitted
 * `frequency` + `dueMonth` and left `paymentMonths` undefined — which let
 * the Supabase column default to `[1..12]` for every charge regardless of
 * frequency. That silently broke `nextDueDateForCharge()` for non-monthly
 * charges (a yearly bill would look due every month).
 *
 * Mapping:
 *   - monthly    → [1..12]                     (every month)
 *   - quarterly  → [dueMonth, +3, +6, +9]      (rolled into [1..12] window)
 *   - semiannual → [dueMonth, +6]              (rolled into [1..12] window)
 *   - annual     → [dueMonth]                  (one month per year)
 *
 * All months are normalised into `[1..12]` and sorted ascending so the
 * downstream `Array.from(new Set(...))` in `createChargeAction` is
 * idempotent.
 */
export function paymentMonthsFromFrequency(frequency: ChargeFrequency, dueMonth: number): number[] {
  const anchor = clampToMonth(dueMonth);

  switch (frequency) {
    case 'monthly':
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    case 'quarterly':
      return [anchor, addMonths(anchor, 3), addMonths(anchor, 6), addMonths(anchor, 9)].sort(
        (a, b) => a - b,
      );
    case 'semiannual':
      return [anchor, addMonths(anchor, 6)].sort((a, b) => a - b);
    case 'annual':
      return [anchor];
    default: {
      // Exhaustiveness check — TypeScript errors here if a new frequency is
      // added without updating the switch. Defensive return so the runtime
      // never hits an "undefined" path.
      const _exhaustive: never = frequency;
      return [_exhaustive as never];
    }
  }
}

function addMonths(month: number, offset: number): number {
  // `((m + offset - 1) mod 12) + 1` keeps the result in [1..12] while
  // wrapping correctly (e.g. 11 + 3 → 2).
  return ((month + offset - 1) % 12) + 1;
}

function clampToMonth(value: number): number {
  if (!Number.isFinite(value)) return 1;
  if (value < 1) return 1;
  if (value > 12) return 12;
  return Math.floor(value);
}
