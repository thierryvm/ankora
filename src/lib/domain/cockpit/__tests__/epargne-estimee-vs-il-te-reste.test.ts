/**
 * « Épargne estimée » et « Il te reste » sont-ils deux libellés pour un seul
 * calcul ?
 *
 * La question s'est posée le 2026-07-31 : sur un profil de test à valeurs
 * contrôlées, le cockpit affichait **382,89 € pour les deux**. Sur un écran qui
 * portait déjà un double comptage avéré (une charge mensuelle et un plan
 * d'apurement désignant la même dette, déduits deux fois), l'hypothèse d'un
 * second agrégat mal câblé méritait d'être testée plutôt que supposée.
 *
 * Réponse : ce sont bien deux calculs.
 *
 *   ilTeReste      = budgetDuMois − depensesDuMois
 *   epargneEstimee = budgetDuMois − depensesDuMois × joursDuMois / joursEcoules
 *
 * Le **dernier jour du mois**, `joursEcoules === joursDuMois`, le facteur de
 * projection vaut 1 et la seconde formule dégénère littéralement en la première.
 * L'égalité observée n'était donc pas une duplication : c'était la bonne réponse
 * un 31. Ce fichier fige la distinction pour que personne ne reclasse ce cas en
 * défaut — ni ne « corrige » l'égalité du dernier jour.
 */
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

import { calculerSituationDuMois } from '@/lib/domain/cockpit/situation-mois';
import type { CockpitCharge, PaymentLedger, ReferencePeriod } from '@/lib/domain/cockpit/types';

const NO_PAYMENTS: PaymentLedger = new Map();
const REF: ReferencePeriod = { year: 2026, month: 7 };
const DEPENSES = '170.90';
const JOURS_DU_MOIS = 31;

const charge = (over: Partial<CockpitCharge>): CockpitCharge => ({
  id: over.id ?? 'c-' + Math.random().toString(36).slice(2),
  label: 'Test',
  amount: new Decimal(0),
  frequency: 'monthly',
  paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  paymentDay: 1,
  isActive: true,
  ...over,
});

/** Les chiffres réels du profil de test du 2026-07-31. */
const profil = (joursEcoules: number) =>
  calculerSituationDuMois({
    revenus: new Decimal(2637),
    charges: [charge({ amount: new Decimal('1804.21'), frequency: 'monthly' })],
    soldeEpargneActuel: new Decimal(430),
    payments: NO_PAYMENTS,
    ref: REF,
    engagementsMensuels: new Decimal(220),
    depensesDuMois: new Decimal(DEPENSES),
    joursEcoules,
    joursDuMois: JOURS_DU_MOIS,
  });

describe('« Épargne estimée » vs « Il te reste »', () => {
  it('le dernier jour du mois, les deux sont égaux PAR CONSTRUCTION, pas par erreur', () => {
    const out = profil(JOURS_DU_MOIS);
    expect(out.epargneEstimee).not.toBeNull();
    expect(out.ilTeReste.toFixed(2)).toBe(out.epargneEstimee?.toFixed(2));
  });

  it('en milieu de mois, les deux divergent — la projection retranche davantage', () => {
    const out = profil(15);

    expect(out.ilTeReste.toFixed(2)).not.toBe(out.epargneEstimee?.toFixed(2));

    // « Il te reste » retranche la dépense RÉELLE.
    expect(out.ilTeReste.toFixed(2)).toBe(out.resteDisponible.minus(DEPENSES).toFixed(2));

    // « Épargne estimée » retranche la dépense PROJETÉE sur le mois entier.
    // On part de `resteDisponible` rendu par le domaine plutôt que de le
    // recomposer à la main : ce profil n'a aucune charge périodique, donc ses
    // provisions lissées valent 0, et refaire le calcul de tête est le meilleur
    // moyen de se tromper sur ce qu'on prétend vérifier.
    const projetees = new Decimal(DEPENSES).times(JOURS_DU_MOIS).dividedBy(15);
    expect(out.epargneEstimee?.toFixed(2)).toBe(out.resteDisponible.minus(projetees).toFixed(2));

    // À dépense constante, projeter au-delà du jour courant ne peut que retirer
    // davantage : l'estimation est nécessairement ≤ « Il te reste ».
    expect(out.epargneEstimee?.lessThan(out.ilTeReste)).toBe(true);
  });

  it('avant le 7e jour, aucune estimation n est produite — « — » et non zéro', () => {
    expect(profil(6).epargneEstimee).toBeNull();
    expect(profil(7).epargneEstimee).not.toBeNull();
  });
});
