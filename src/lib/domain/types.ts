import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

export type Money = Decimal;

export const money = (value: number | string | Decimal): Money => new Decimal(value);
export const zero = (): Money => new Decimal(0);

export type ChargeFrequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

export type Charge = {
  id: string;
  label: string;
  amount: Money;
  frequency: ChargeFrequency;
  /** Month (1-12) at which the charge is due. For quarterly/semiannual/annual — the reference month. */
  dueMonth: number;
  categoryId: string | null;
  isActive: boolean;
};

export type Expense = {
  id: string;
  label: string;
  amount: Money;
  /** ISO date */
  occurredOn: string;
  categoryId: string | null;
  note: string | null;
};

export type MonthKey =
  `${number}-${'01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10' | '11' | '12'}`;
