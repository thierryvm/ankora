import Decimal from 'decimal.js';

import { effortFinancierLisse } from '@/lib/domain/cockpit/effort-financier-lisse';
import type { CockpitCharge } from '@/lib/domain/cockpit/types';

/**
 * « EFFORT LISSÉ » — the budget view.
 *
 * charges mensuelles + provisions lissées + mensualités d'engagement. This is
 * what « Budget du mois » deducts from income, and the figure @thierry uses as
 * his control total (1 863,21 €/mois).
 *
 * ## Why this thin wrapper exists rather than an inline `.plus()`
 *
 * The two views need two NAMES. « À payer ce mois » (`du-mois.ts`) and « Effort
 * lissé » are different numbers by design, and the whole class of bugs this
 * chantier closes came from a screen showing two totals whose periods nobody
 * had named. A caller that writes `effortLisse(charges, engagements)` cannot
 * accidentally present it as the month's cash.
 *
 * The arithmetic is unchanged from `situation-mois.ts:95-113` — deliberately.
 * The double count was never in this formula: it was a single obligation
 * recorded in BOTH tables, so `charges` and `commitments` each contributed it
 * once. The fix is structural (one obligation, one table — see the conversion
 * flow) plus a warning when the pair reappears, never a subtraction here.
 */
export function effortLisse(
  charges: readonly CockpitCharge[],
  engagementsMensuels: Decimal,
): Decimal {
  return effortFinancierLisse(charges).plus(engagementsMensuels);
}

/** Annual equivalent of the smoothed effort — the same number × 12. */
export function effortLisseAnnuel(
  charges: readonly CockpitCharge[],
  engagementsMensuels: Decimal,
): Decimal {
  return effortLisse(charges, engagementsMensuels).times(12);
}
