import Decimal from 'decimal.js';

/**
 * Cockpit-flavoured frequency. Mirrors `ChargeFrequency` from `domain/types`
 * but is locally re-declared so this module stays self-contained.
 */
export type CockpitFrequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

/**
 * Number of months a charge spans for smoothing purposes.
 *   monthly    → 1  (no smoothing — already monthly)
 *   quarterly  → 3
 *   semiannual → 6  (extension over the original IronBudget spec — Ankora
 *                    has supported this frequency since the initial schema
 *                    and the cockpit must handle it)
 *   annual     → 12
 */
export const CYCLE_MONTHS: Record<CockpitFrequency, number> = Object.freeze({
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
});

/**
 * Account type sémantique adopté par ADR-008.
 *  - income_bills : compte courant qui reçoit le salaire et paye les charges fixes mensuelles
 *  - provisions   : compte épargne qui lisse les charges périodiques
 *  - daily_card   : carte quotidienne (courses / essence / loisirs) avec plafond mensuel
 */
export type AccountType = 'income_bills' | 'provisions' | 'daily_card';

/**
 * Cockpit-shaped charge. The DB carries this through `payment_months[]`
 * (the months the charge falls due) and `payment_day` (day of month).
 *
 * `paymentMonths` MUST be sorted ascending and contain values 1..12.
 * Empty arrays are not allowed (a charge with no due months is meaningless).
 */
export type CockpitCharge = Readonly<{
  id: string;
  label: string;
  /** Decimal — not a Number — so that 53 / 12 stays exact. */
  amount: Decimal;
  frequency: CockpitFrequency;
  /** Sorted ascending, all values 1..12, length ≥ 1. */
  paymentMonths: readonly number[];
  /** 1..31 — used by the bell notifications, not by the smoothing math. */
  paymentDay: number;
  /** Whether this charge is enabled. Inactive charges are excluded from cockpit math. */
  isActive: boolean;
}>;

/**
 * Read-only map of "has this charge been paid for that period?".
 * Key format: `${chargeId}-${year}-${month1to12}` (no zero-padding).
 *
 * Implemented as a plain Map so callers can construct it from the DB
 * `charge_payments` rows without intermediate allocations:
 *
 *   const payments = new Map(rows.map(r => [`${r.charge_id}-${r.period_year}-${r.period_month}`, true]));
 */
export type PaymentLedger = ReadonlyMap<string, boolean>;

/**
 * Builds the canonical key used by `PaymentLedger`. Centralised here so
 * producers and consumers can't drift on the format.
 */
export function paymentKey(chargeId: string, year: number, month: number): string {
  return `${chargeId}-${year}-${month}`;
}

/**
 * Reference period for cockpit calculations. The cockpit always projects
 * around a single (year, month) — typically the user's selected month
 * via the `?month=YYYY-MM` URL parameter (PR-D2).
 */
export type ReferencePeriod = Readonly<{
  year: number;
  month: number; // 1..12
}>;

export function isPeriodicFrequency(f: CockpitFrequency): boolean {
  return f !== 'monthly';
}

/**
 * Filters a list of charges down to the periodic ones (everything except
 * `monthly`). Centralised because the cockpit makes this distinction in
 * many places and a stray inclusion of monthlies in "provisions" math
 * would be a hard-to-spot bug.
 */
export function periodicCharges(charges: readonly CockpitCharge[]): readonly CockpitCharge[] {
  return charges.filter((c) => c.isActive && isPeriodicFrequency(c.frequency));
}

/** Same shape, restricted to monthly + active. */
export function monthlyCharges(charges: readonly CockpitCharge[]): readonly CockpitCharge[] {
  return charges.filter((c) => c.isActive && c.frequency === 'monthly');
}
