import Decimal from 'decimal.js';

import { capaciteEpargneReelle } from './capacite-epargne-reelle';
import { provisionsMensuellesLissees, totalChargesMensuelles } from './effort-financier-lisse';
import { calculerSanteProvisions } from './sante-provisions';
import type { CockpitCharge, PaymentLedger, ReferencePeriod } from './types';

/**
 * Statut « Situation du mois » — narration calme du Hero dashboard (Phase 0,
 * THI-327). Dérivé des primitives cockpit existantes (aucun calcul nouveau).
 *
 *  - vert      : capacité ≥ 0 ET provisions à jour
 *  - orange    : capacité < 0 OU provisions en déficit (mais revenus couvrent
 *                les obligations charges + provisions)
 *  - rouge     : charges + provisions + engagements > revenus (resteDisponible < 0)
 *  - incomplet : revenus non configurés (monthlyIncome === null) → fix THI-335
 *                (aucun chiffre négatif anxiogène n'est exposé à l'UI)
 */
export type SituationStatut = 'vert' | 'orange' | 'rouge' | 'incomplet';

export type SituationDuMoisInput = Readonly<{
  /** Revenus mensuels. `null` = non configuré → statut incomplet (THI-335). */
  revenus: Decimal | null;
  charges: readonly CockpitCharge[];
  /** Budget « vie courante » (domaine resteAVivre). */
  budgetVieCourante: Decimal;
  soldeEpargneActuel: Decimal;
  payments: PaymentLedger;
  ref: ReferencePeriod;
  /**
   * Mensualités lissées des engagements actifs (ADR-021), calculées par la page
   * via `engagementsMensuelsLisses`. Requis (pas de default silencieux) : un
   * oubli de wiring doit casser à la compilation. 0 quand aucun engagement.
   */
  engagementsMensuels: Decimal;
}>;

export type SituationDuMois = Readonly<{
  statut: SituationStatut;
  hasRevenus: boolean;
  /** 0 quand incomplet. */
  revenus: Decimal;
  chargesFixes: Decimal;
  provisionsLissees: Decimal;
  /** Mensualités lissées des engagements actifs (ADR-021). 0 si aucun. */
  engagementsMensuels: Decimal;
  /** Chiffre-héros = revenus − chargesFixes − provisionsLissees − engagementsMensuels. */
  resteDisponible: Decimal;
  budgetVieCourante: Decimal;
  capacite: Decimal;
  provisionsAJour: boolean;
  deficitEpargne: Decimal;
  rattrapageMensuel: Decimal;
}>;

export function calculerSituationDuMois(input: SituationDuMoisInput): SituationDuMois {
  const hasRevenus = input.revenus !== null;
  const revenus = input.revenus ?? new Decimal(0);

  const capac = capaciteEpargneReelle({
    revenus,
    charges: input.charges,
    resteAVivre: input.budgetVieCourante,
  });

  const sante = calculerSanteProvisions({
    charges: input.charges,
    payments: input.payments,
    soldeEpargneActuel: input.soldeEpargneActuel,
    ref: input.ref,
  });

  const chargesFixes = totalChargesMensuelles(input.charges);
  const provisionsLissees = provisionsMensuellesLissees(input.charges);
  const provisionsAJour = sante.statut === 'a_jour';

  // ADR-021: engagements (dettes/échéanciers actifs) sont une sortie fixe
  // mensuelle réelle — on retire leur mensualité lissée du reste disponible
  // (charges-only via `capaciteEpargneReelle`, inchangé) pour que le hero et la
  // carte « Mes engagements » cessent de se contredire.
  const { engagementsMensuels } = input;
  const resteDisponible = capac.resteDisponible.minus(engagementsMensuels);
  const capacite = resteDisponible.minus(capac.resteAVivre);

  let statut: SituationStatut;
  if (!hasRevenus) {
    statut = 'incomplet';
  } else if (resteDisponible.lt(0)) {
    statut = 'rouge';
  } else if (capacite.lt(0) || !provisionsAJour) {
    statut = 'orange';
  } else {
    statut = 'vert';
  }

  return {
    statut,
    hasRevenus,
    revenus,
    chargesFixes,
    provisionsLissees,
    engagementsMensuels,
    resteDisponible,
    budgetVieCourante: capac.resteAVivre,
    capacite,
    provisionsAJour,
    deficitEpargne: sante.deficitEpargne,
    rattrapageMensuel: sante.rattrapageMensuel,
  };
}
