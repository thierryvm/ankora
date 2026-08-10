/**
 * `payment_months[]` schedule for a charge — seed-script mirror of the domain
 * function `paymentMonthsFromFrequency()` (src/lib/domain/charges).
 *
 * WHY A MIRROR RATHER THAN AN IMPORT. The canonical implementation is
 * TypeScript and imports its `ChargeFrequency` type through the `@/` path
 * alias. Seed scripts run under plain `node`, outside the application bundle
 * and outside any resolver that knows that alias, so the import is not
 * available to them.
 *
 * WHY THAT MIRROR IS NOT A LIABILITY. `scripts/dev/__tests__/payment-months-parity.test.ts`
 * asserts the two agree over every frequency and every anchor month, plus the
 * out-of-range anchors where they are easiest to drift apart. If either side
 * changes alone, that test fails — the duplication is *checked*, not merely
 * declared. This file must not gain a behaviour the parity test does not
 * cover.
 *
 * WHY IT EXISTS AT ALL. `payment_months` is the only column the UI reads to
 * decide whether a charge falls in a given month. The seed scripts left it
 * unset, so the column default `{1,…,12}` applied and every annual tax in the
 * test profile was due *every month* — inflating the amount left to pay by
 * 573 € and inventing five overdue bills. A harness defect, not a product one,
 * but it falsified every measurement taken on that profile. Measured
 * 10 August 2026.
 */

/** Wrap a month offset back into [1..12] (e.g. 11 + 3 → 2). */
const addMonths = (month, offset) => ((month + offset - 1) % 12) + 1;

/**
 * Clamp an anchor into [1..12]. Mirrors the domain's `clampToMonth`, including
 * its refusal to wrap: an anchor of 13 becomes 12, NOT 1. Wrapping here is the
 * single easiest way for the two implementations to drift, which is why the
 * parity test exercises it explicitly.
 */
const clampToMonth = (value) => {
  if (!Number.isFinite(value)) return 1;
  if (value < 1) return 1;
  if (value > 12) return 12;
  return Math.floor(value);
};

export function moisDePaiement(frequency, dueMonth) {
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
    default:
      // The domain function is exhaustively typed and cannot reach here; this
      // mirror has no types, so an unknown frequency must fail loudly rather
      // than seed a schedule nobody asked for.
      throw new Error(`fréquence inconnue : ${frequency}`);
  }
}
