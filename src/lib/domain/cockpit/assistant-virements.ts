import Decimal from 'decimal.js';

import { provisionsMensuellesLissees } from './effort-financier-lisse';
import {
  CYCLE_MONTHS,
  isPeriodicFrequency,
  periodicCharges,
  type CockpitCharge,
  type CockpitFrequency,
  type ReferencePeriod,
} from './types';

export type DetailProvision = Readonly<{
  chargeId: string;
  label: string;
  frequency: Exclude<CockpitFrequency, 'monthly'>;
  montantOriginal: Decimal;
  /** amount / cycleMonths — the smoothed monthly contribution for this charge. */
  provisionLissee: Decimal;
}>;

export type AssistantVirementsInput = Readonly<{
  charges: readonly CockpitCharge[];
  ref: ReferencePeriod;
  /** Comes from `calculerSanteProvisions(...).rattrapageMensuel` (≥ 0). */
  rattrapageMensuel: Decimal;
}>;

export type VirementDirection = 'vers_epargne' | 'depuis_epargne' | 'aucun';

export type AssistantVirementsOutput = Readonly<{
  provisionMensuelleTotale: Decimal;
  totalPeriodiquesMois: Decimal;
  /** provision - périodiques (raw, before rattrapage). May be negative. */
  transfertRecommande: Decimal;
  /** transfertRecommande + rattrapageMensuel. May be negative. */
  transfertRecommandeAjuste: Decimal;
  direction: VirementDirection;
  detailProvisions: readonly DetailProvision[];
}>;

/**
 * Assistant Virements (ADR-012) — the differentiating cockpit calculation.
 *
 *   provisionMensuelleTotale = Σ(periodic charge amount / cycleMonths)
 *   totalPeriodiquesMois     = Σ(periodic charge amount where ref.month ∈ paymentMonths)
 *   transfertRecommande      = provision - périodiquesMois
 *   transfertRecommandeAjuste = transfertRecommande + rattrapageMensuel
 *
 * Direction:
 *   > 0  → "vers_epargne"   (top up the savings buffer)
 *   < 0  → "depuis_epargne" (pull from savings to settle the periodic bills)
 *   = 0  → "aucun"          (perfect equilibrium for the month)
 */
export function calculerAssistantVirements(
  input: AssistantVirementsInput,
): AssistantVirementsOutput {
  const periodics = periodicCharges(input.charges);

  // Defensive narrowing: the spec excludes monthly from this list and
  // `Exclude<CockpitFrequency, 'monthly'>` makes it safe in the output type.
  const detailProvisions: DetailProvision[] = periodics.map((c) => {
    if (!isPeriodicFrequency(c.frequency)) {
      throw new Error('periodicCharges leaked a monthly charge — invariant broken');
    }
    const cycleMonths = CYCLE_MONTHS[c.frequency];
    return {
      chargeId: c.id,
      label: c.label,
      frequency: c.frequency as Exclude<CockpitFrequency, 'monthly'>,
      montantOriginal: c.amount,
      provisionLissee: c.amount.dividedBy(cycleMonths),
    };
  });

  const provisionMensuelleTotale = provisionsMensuellesLissees(input.charges);

  const totalPeriodiquesMois = periodics
    .filter((c) => c.paymentMonths.includes(input.ref.month))
    .reduce((acc, c) => acc.plus(c.amount), new Decimal(0));

  const transfertRecommande = provisionMensuelleTotale.minus(totalPeriodiquesMois);
  const transfertRecommandeAjuste = transfertRecommande.plus(input.rattrapageMensuel);

  let direction: VirementDirection;
  if (transfertRecommandeAjuste.gt(0)) direction = 'vers_epargne';
  else if (transfertRecommandeAjuste.lt(0)) direction = 'depuis_epargne';
  else direction = 'aucun';

  return {
    provisionMensuelleTotale,
    totalPeriodiquesMois,
    transfertRecommande,
    transfertRecommandeAjuste,
    direction,
    detailProvisions,
  };
}
