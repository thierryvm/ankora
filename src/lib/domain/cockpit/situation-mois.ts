import Decimal from 'decimal.js';

import {
  effortFinancierLisse,
  provisionsMensuellesLissees,
  totalChargesMensuelles,
} from './effort-financier-lisse';
import { depensesProjetees, epargneEstimee } from './epargne-estimee';
import type { OperationsDuMois } from './operations-du-mois';
import { calculerSanteProvisions } from './sante-provisions';
import type { CockpitCharge, PaymentLedger, ReferencePeriod } from './types';

/**
 * Statut « Situation du mois » — narration calme du Hero dashboard (Phase 0,
 * THI-327). Dérivé des primitives cockpit existantes (aucun calcul nouveau).
 *
 *  - vert      : capacité ≥ 0 ET provisions à jour
 *  - orange    : capacité < 0 OU provisions en déficit (mais revenus couvrent
 *                les obligations charges + provisions)
 *  - rouge     : charges + provisions + engagements > revenus
 *                (budgetAvantMiseDeCote < 0 ; une mise de côté qui fait passer
 *                le budget sous zéro donne orange, pas rouge — PR D)
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
  /**
   * Ce que le journal des opérations fait au mois (PR D), calculé par
   * `operationsDuMois()`. Requis pour la même raison que les deux champs
   * au-dessus : un oubli de câblage doit casser à la compilation, pas rendre un
   * « Il te reste » qui ignore les virements. `AUCUNE_OPERATION` pour un
   * journal vide.
   */
  operations: OperationsDuMois;
  /** Jours écoulés dans le mois de référence, aujourd'hui inclus. */
  joursEcoules: number;
  /** Nombre de jours du mois de référence. */
  joursDuMois: number;
}>;

export type SituationDuMois = Readonly<{
  statut: SituationStatut;
  hasRevenus: boolean;
  /**
   * Revenus du mois (PR D) = revenu de base + argent reçu « en plus ». 0 quand
   * incomplet.
   */
  revenus: Decimal;
  /** Le revenu écrit dans les réglages, tel quel. `null` = non configuré. */
  revenuEcrit: Decimal | null;
  /**
   * La somme des argents reçus `regular` du mois, `null` s'il n'y en a aucun.
   * Quand elle existe, elle REMPLACE le revenu écrit (règle de la maquette) :
   * la cascade dit alors « reçu X, prévu Y » si les deux diffèrent.
   */
  revenuRecu: Decimal | null;
  /** L'argent reçu « en plus du revenu » (`extra`) du mois. */
  recuEnPlus: Decimal;
  /**
   * « Déjà compté pour tes factures » = factures mensuelles + effort lissé +
   * échéances. Porté ici plutôt que dérivé à l'affichage : `revenus −
   * resteDisponible` avalerait le mis de côté depuis la PR D.
   */
  retenu: Decimal;
  /** `revenus − retenu` : ce que le revenu laisse avant toute mise de côté. */
  budgetAvantMiseDeCote: Decimal;
  /** « Mis de côté » : la part d'épargne libre des virements faits du mois. */
  misDeCote: Decimal;
  /**
   * Ce que les virements faits depuis le compte principal ont sorti AU-DELÀ de
   * `budgetAvantMiseDeCote` ; 0 sinon. Lu par la phrase neutre de la
   * cascade, n'entre dans aucun calcul.
   */
  auDelaDuRevenu: Decimal;
  chargesFixes: Decimal;
  provisionsLissees: Decimal;
  /** Mensualités lissées des engagements actifs (ADR-021). 0 si aucun. */
  engagementsMensuels: Decimal;
  /**
   * « Budget du mois » (ADR-035, PR D) = revenus − chargesFixes −
   * provisionsLissees − engagementsMensuels − misDeCote. Nom de code délibérément inchangé : le renommer
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
  /**
   * Où la dépense du mois atterrit si le rythme tient — le point terminal de la
   * courbe. `null` exactement quand `epargneEstimee` l'est : les deux sortent de
   * la même fonction, donc une courbe qui s'arrêterait pendant que la cascade
   * affiche encore une estimation n'est pas représentable.
   */
  depensesProjetees: Decimal | null;
  provisionsAJour: boolean;
  deficitEpargne: Decimal;
  rattrapageMensuel: Decimal;
}>;

export function calculerSituationDuMois(input: SituationDuMoisInput): SituationDuMois {
  const { operations } = input;
  // PR D — le revenu de base : l'argent reçu `regular` du mois quand il y en a
  // (c'est l'arrivée du revenu, il remplace l'écrit), sinon le revenu écrit.
  // Sans l'un ni l'autre, l'argent reçu « en plus » est tout ce qu'il y a, et
  // la maquette calcule sur lui. Sans rien du tout : incomplet (THI-335).
  const revenuBase = operations.revenuRecu ?? input.revenus;
  const hasRevenus = revenuBase !== null || operations.recuEnPlus.gt(0);
  const revenus = (revenuBase ?? new Decimal(0)).plus(operations.recuEnPlus);

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
  const budgetAvantMiseDeCote = resteAvantEngagements.minus(engagementsMensuels);
  const retenu = effort.plus(engagementsMensuels);

  // PR D — la part d'épargne libre des virements faits sort du budget. La part
  // « provisions » n'y est pas : elle est déjà dans `effort` (lissage).
  const misDeCote = operations.misDeCote;
  const resteDisponible = budgetAvantMiseDeCote.minus(misDeCote);
  // Ce que le revenu laissait ne descend pas sous zéro dans cette phrase : la
  // maquette soustrait le budget brut, et un budget négatif SANS aucun virement
  // y faisait dire « tu as mis de côté 0,01 € de plus » — trouvé par la
  // propriété « zéro opération ». Écart déclaré dans la PR D.
  const laisse = Decimal.max(budgetAvantMiseDeCote, 0);
  const depasse = operations.sortiesDuPrincipal.minus(laisse);
  const auDelaDuRevenu = hasRevenus && depasse.gt(0) ? depasse : new Decimal(0);

  // ADR-035 — le chiffre-héros passe en temps réel. Aucun double comptage :
  // `resteDisponible` ne contient que des charges et engagements lissés, et
  // l'invariant du domaine veut qu'une occurrence de charge/engagement ne soit
  // jamais une `expense`. Les deux univers sont disjoints.
  const ilTeReste = resteDisponible.minus(depensesDuMois);
  const paramsProjection = {
    budgetDuMois: resteDisponible,
    depensesDuMois,
    joursEcoules: input.joursEcoules,
    joursDuMois: input.joursDuMois,
  };
  const epargne = epargneEstimee(paramsProjection);
  // La projection de DÉPENSE, pour le point terminal de la courbe. Lue à la
  // source plutôt que reconstruite par `resteDisponible − epargne` : deux
  // calculs de la même quantité finissent toujours par diverger, et celui-ci
  // s'afficherait à côté de l'autre.
  const projetees = depensesProjetees(paramsProjection);

  let statut: SituationStatut;
  if (!hasRevenus) {
    statut = 'incomplet';
  } else if (budgetAvantMiseDeCote.lt(0)) {
    // Les obligations dépassent les revenus. Une mise de côté qui fait passer
    // le budget sous zéro n'est pas ce cas-là : c'est « Il te reste » négatif,
    // donc orange ci-dessous.
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
    revenuEcrit: input.revenus,
    revenuRecu: operations.revenuRecu,
    recuEnPlus: operations.recuEnPlus,
    retenu,
    budgetAvantMiseDeCote,
    misDeCote,
    auDelaDuRevenu,
    chargesFixes,
    provisionsLissees,
    engagementsMensuels,
    resteDisponible,
    depensesDuMois,
    ilTeReste,
    epargneEstimee: epargne,
    depensesProjetees: projetees,
    provisionsAJour,
    deficitEpargne: sante.deficitEpargne,
    rattrapageMensuel: sante.rattrapageMensuel,
  };
}
