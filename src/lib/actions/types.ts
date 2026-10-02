export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | {
      ok: false;
      errorCode: string;
      fieldErrors?: Record<string, string[]>;
    };

/**
 * What became of this month's payment when a bill's amount was corrected.
 *   - `followed`  : it had been recorded at the bill's previous amount (the
 *                   default when ticked), and now carries the new one.
 *   - `kept`      : it carries an amount typed by hand; it is left alone and
 *                   the UI says so, with that amount.
 *   - `unchanged` : it should have followed, but the write failed or touched
 *                   no row (changed elsewhere meanwhile) — never announced as
 *                   followed; `paidAmount` is the amount it was read at.
 * A payment typed by hand at exactly the bill's previous amount cannot be told
 * apart from a default one (same column): it follows.
 * Absent when the amount did not change, or no payment exists this month.
 */
export type ChargePaymentFollow =
  | { kind: 'followed'; periodYear: number; periodMonth: number; paidAmount: number }
  | { kind: 'kept'; periodYear: number; periodMonth: number; paidAmount: number }
  | { kind: 'unchanged'; periodYear: number; periodMonth: number; paidAmount: number };
