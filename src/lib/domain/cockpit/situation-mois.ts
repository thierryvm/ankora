import Decimal from 'decimal.js';

import {
  effortFinancierLisse,
  provisionsMensuellesLissees,
  totalChargesMensuelles,
} from './effort-financier-lisse';
import { epargneEstimee } from './epargne-estimee';
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
  soldeEpargneActuel: Decimal;
  payments: PaymentLedger;
  ref: ReferencePeriod;
  /**
   * Mensualités lissées des engagements actifs (ADR-021), calculées par la page
   * via `engagementsMensuelsLisses`. Requis (pas de default silencieux) : un
   * oubli de wiring doit casser à la compilation. 0 quand aucun engagement.
   */
  engagementsMensuels: Decimal;
  /**
   * « Dépensé ce mois » — somme des dépenses saisies sur le mois de référence,
   * calculée par la page via `depensesDuMois()`. Requis pour la même raison que
   * `engagementsMensuels` : un oubli de wiring doit casser à la compilation,
   * pas rendre un héros silencieusement faux (ADR-035).
   */
  depensesDuMois: Decimal;
  /** Jours écoulés dans le mois de référence, aujourd'hui inclus. */
  joursEcoules: number;
  /** Nombre de jours du mois de référence. */
  joursDuMois: number;
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
  /**
   * « Budget du mois » (ADR-035) = revenus − chargesFixes − provisionsLissees
   * − engagementsMensuels. Nom de code délibérément inchangé : le renommer
   * dans le domaine était le risque le plus cher du chantier vocabulaire, pour
   * un gain nul côté utilisateur. Ce n'est plus le chiffre-héros, c'est l'ancre
   * affichée sous lui.
   */
  resteDisponible: Decimal;
  /** « Dépensé ce mois » (ADR-035). */
  depensesDuMois: Decimal;
  /**
   * « Il te reste » (ADR-035) — le chiffre-héros, en temps réel.
   * `resteDisponible − depensesDuMois`. Descend quand l'utilisateur saisit une
   * dépense : c'est la boucle de rétroaction que le cockpit n'avait pas.
   */
  ilTeReste: Decimal;
  /**
   * « Épargne estimée » (ADR-035). `null` avant le 7ᵉ jour du mois — une
   * projection sur deux jours est du bruit, et « pas encore d'estimation »
   * n'est pas « une estimation à zéro ».
   */
  epargneEstimee: Decimal | null;
  provisionsAJour: boolean;
  deficitEpargne: Decimal;
  rattrapageMensuel: Decimal;
}>;

export function calculerSituationDuMois(input: SituationDuMoisInput): SituationDuMois {
  const hasRevenus = input.revenus !== null;
  const revenus = input.revenus ?? new Decimal(0);

  // ADR-035 — l'enveloppe « vie courante » a disparu, et avec elle
  // `capaciteEpargneReelle()` : privée de son `resteAVivre`, elle ne calculait
  // plus aucune capacité et ne gardait qu'un nom trompeur. Ses deux lignes
  // utiles sont ici.
  const effort = effortFinancierLisse(input.charges);
  const resteAvantEngagements = revenus.minus(effort);

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
  // mensuelle réelle — on retire leur mensualité lissée pour que le hero et la
  // carte « Mes engagements » cessent de se contredire.
  const { engagementsMensuels, depensesDuMois } = input;
  const resteDisponible = resteAvantEngagements.minus(engagementsMensuels);

  // ADR-035 — le chiffre-héros passe en temps réel. Aucun double comptage :
  // `resteDisponible` ne contient que des charges et engagements lissés, et
  // l'invariant du domaine veut qu'une occurrence de charge/engagement ne soit
  // jamais une `expense`. Les deux univers sont disjoints.
  const ilTeReste = resteDisponible.minus(depensesDuMois);
  const epargne = epargneEstimee({
    budgetDuMois: resteDisponible,
    depensesDuMois,
    joursEcoules: input.joursEcoules,
    joursDuMois: input.joursDuMois,
  });

  let statut: SituationStatut;
  if (!hasRevenus) {
    statut = 'incomplet';
  } else if (resteDisponible.lt(0)) {
    statut = 'rouge';
  } else if (ilTeReste.lt(0) || !provisionsAJour) {
    // ADR-035 — la branche « capacité < 0 » disparaît avec l'enveloppe. Ce qui
    // la remplace n'est pas un équivalent mais une meilleure question : le mois
    // est à surveiller quand ce qu'il reste réellement est passé sous zéro,
    // pas quand un budget inventé par l'utilisateur l'est.
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
    depensesDuMois,
    ilTeReste,
    epargneEstimee: epargne,
    provisionsAJour,
    deficitEpargne: sante.deficitEpargne,
    rattrapageMensuel: sante.rattrapageMensuel,
  };
}
