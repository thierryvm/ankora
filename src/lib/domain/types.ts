import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

export type Money = Decimal;

export const money = (value: number | string | Decimal): Money => new Decimal(value);
export const zero = (): Money => new Decimal(0);

/**
 * Single source of truth for the supported cadences (Sourcery #228): every
 * UI list (CadenceField, charges forms) derives from this — the type below
 * is inferred from it, so adding a frequency updates all call-sites at once.
 */
export const CHARGE_FREQUENCIES = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;
export type ChargeFrequency = (typeof CHARGE_FREQUENCIES)[number];

/** Physical account that settles a charge or an expense. */
export type AccountKind = 'principal' | 'vie_courante' | 'epargne';

/** Accounts allowed as a charge source. Vie-courante is excluded by design:
 *  its role is daily spending, not bill settlement. */
export type ChargePaidFrom = Extract<AccountKind, 'principal' | 'epargne'>;

export type Charge = {
  id: string;
  label: string;
  amount: Money;
  frequency: ChargeFrequency;
  /** Month (1-12) at which the charge is due. For quarterly/semiannual/annual — the reference month. */
  dueMonth: number;
  /**
   * Months (1-12) the charge falls due. Sorted ascending. Length ≥ 1.
   * Drives cron-aware schedule resolution (THI-192 Prochaines factures).
   * Backed by the `payment_months smallint[]` column added in
   * `20260503000002_pr_d1_charges_enrichments.sql`.
   */
  paymentMonths: readonly number[];
  /**
   * Day of month (1-31) when the charge is due. Drives J-7/J-14/J-30
   * bucketing + bell notifications. Backed by the `payment_day smallint`
   * column added in `20260503000002_pr_d1_charges_enrichments.sql`.
   */
  paymentDay: number;
  categoryId: string | null;
  isActive: boolean;
  /**
   * Manual "à surveiller" dashboard marker (THI-329 PR-C). Pure UI metadata —
   * never read by domain math, hence optional so domain-math test fixtures
   * don't have to carry it. The snapshot mapping always sets it.
   */
  isWatched?: boolean;
  /** Which account settles the bill. Defaults to 'principal' in the DB;
   *  periodic charges normally use 'epargne' to be smoothed. */
  paidFrom: ChargePaidFrom;
};

export type Expense = {
  id: string;
  label: string;
  amount: Money;
  /** ISO date */
  occurredOn: string;
  categoryId: string | null;
  note: string | null;
  paidFrom: AccountKind;
};

export type MonthKey =
  `${number}-${'01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10' | '11' | '12'}`;
