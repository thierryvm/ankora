import { describe, expect, it } from 'vitest';

import type { Commitment } from '../../commitments';
import {
  installmentAmountAt,
  installmentIndexAt,
  lastInstallmentAmount,
  periodKey,
  remainingBalance,
} from '../../commitments';
import { engagementsDuMois, engagementsMensuelsLisses } from '../engagements-lisses';
import { obligationsDuMois, aPayerCeMois } from '../../obligations/du-mois';

/**
 * # Le mois de la dernière échéance ne vaut pas une mensualité pleine
 *
 * Le modèle source de @thierry le dit dans son propre mode d'emploi : un plan
 * stocke son **montant total**, et `mensualité × nombre d'échéances` ne retombe
 * pas dessus — la dernière est un solde, plus petit.
 *
 * Le domaine savait déjà le calculer (`lastInstallmentAmount`), et la page
 * Engagements l'affichait déjà (« 10 × 220 € + 200 € »). Mais le cockpit et la
 * vue caisse soustrayaient la mensualité pleine **tous les mois, dernier
 * compris**. Deux écrans de la même application se contredisaient au mois qui
 * compte le plus.
 *
 * Aucun des 734 tests du domaine n'échouait avant correction : le mois final
 * n'était couvert nulle part. Ce fichier est ce trou-là.
 */

/** Plan à 2 400 € en 11 échéances de 220 € → 10 × 220 + **200**, pas 11 × 220. */
const planAvecResidu: Commitment = {
  id: 'plan',
  kind: 'installment_plan',
  totalAmount: 2400,
  installmentAmount: 220,
  installmentsTotal: 11,
  startYear: 2026,
  startMonth: 1,
  paymentDay: 15,
  frequency: 'monthly',
  isActive: true,
};

/** Le même plan sans résidu : 11 × 220 = 2 420. Rien ne doit y bouger. */
const planSansResidu: Commitment = { ...planAvecResidu, id: 'net', totalAmount: 2420 };

/** Trimestriel 4 × 600 pour 2 200 € engagés → dernière échéance à 400 €. */
const trimestriel: Commitment = {
  id: 'trim',
  kind: 'installment_plan',
  totalAmount: 2200,
  installmentAmount: 600,
  installmentsTotal: 4,
  startYear: 2026,
  startMonth: 1,
  paymentDay: 20,
  frequency: 'quarterly',
  isActive: true,
};

/** Paiement unique : `installmentsTotal === 1`, donc index 0 EST l'index final. */
const paiementUnique: Commitment = {
  id: 'unique',
  kind: 'one_off',
  totalAmount: 340,
  installmentAmount: null,
  installmentsTotal: 1,
  startYear: 2026,
  startMonth: 3,
  paymentDay: 10,
  frequency: 'monthly',
  isActive: true,
};

const nomme = (c: Commitment, label: string) => ({ ...c, label });
const vide: ReadonlyMap<string, ReadonlySet<string>> = new Map();
const pointe = (c: Commitment, keys: string[]) => new Map([[c.id, new Set(keys)]]);

describe('la dernière échéance porte le solde, pas la mensualité', () => {
  it('le cockpit soustrait 220 € les dix premiers mois et 200 € le onzième', () => {
    const ordinaire = engagementsMensuelsLisses([planAvecResidu], vide, { year: 2026, month: 6 });
    expect(ordinaire.toNumber()).toBe(220);

    // Nov. 2026 = janvier + 10 cycles = la 11e et dernière échéance.
    const finale = engagementsMensuelsLisses([planAvecResidu], vide, { year: 2026, month: 11 });
    expect(finale.toNumber(), 'le mois final vaut le solde, pas la mensualité').toBe(200);
  });

  it('la vue caisse « À payer ce mois » dit le même montant que le cockpit', () => {
    const entree = (month: number) => ({
      charges: [],
      chargePayments: new Map(),
      commitments: [nomme(planAvecResidu, 'Plan')],
      paidKeysByCommitment: vide,
      ref: { year: 2026, month },
    });

    expect(aPayerCeMois(obligationsDuMois(entree(6))).toNumber()).toBe(220);
    expect(
      aPayerCeMois(obligationsDuMois(entree(11))).toNumber(),
      'les deux écrans doivent être d’accord au mois final',
    ).toBe(200);
  });

  it('l’index reste 1-based dans la vue caisse après suppression du helper privé', () => {
    const lignes = obligationsDuMois({
      charges: [],
      chargePayments: new Map(),
      commitments: [nomme(planAvecResidu, 'Plan')],
      paidKeysByCommitment: vide,
      ref: { year: 2026, month: 11 },
    });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.installmentIndex, '11e échéance sur 11').toBe(11);
    expect(lignes[0]?.amountDue.toNumber()).toBe(200);
  });

  it('la décomposition montre l’échéance du mois, jamais la régulière (règle 10)', () => {
    const poste = engagementsDuMois([nomme(trimestriel, 'Trimestriel')], vide, {
      year: 2026,
      month: 10,
    });

    const part = poste.parts[0];
    expect(part).toBeDefined();
    expect(
      part?.origine?.montantFacture.toNumber(),
      'sinon la disclosure afficherait « 600 € ÷ 3 » à côté d’un 133,33 € qui n’en découle pas',
    ).toBe(400);

    // La somme des parts reconstitue le total, sans arrondi intermédiaire.
    expect(poste.total.toFixed(10)).toBe(part?.montantMensuel.toFixed(10));
    expect(poste.total.toDecimalPlaces(2).toNumber()).toBe(133.33);
  });

  it('le lissage du dernier cycle divise le solde, pas la mensualité', () => {
    const cycleOrdinaire = engagementsMensuelsLisses([trimestriel], vide, {
      year: 2026,
      month: 2,
    });
    expect(cycleOrdinaire.toNumber()).toBe(200);

    // Oct. 2026 = janvier + 3 cycles = la 4e et dernière échéance, à 400 €.
    const dernierCycle = engagementsMensuelsLisses([trimestriel], vide, { year: 2026, month: 10 });
    expect(dernierCycle.toDecimalPlaces(2).toNumber()).toBe(133.33);
  });

  it('un plan sans résidu ne bouge d’aucun centime', () => {
    for (const month of [1, 6, 11]) {
      expect(
        engagementsMensuelsLisses([planSansResidu], vide, { year: 2026, month }).toNumber(),
      ).toBe(220);
    }
  });

  it('un paiement unique rend son total, comme avant', () => {
    // `engagementPeseSurMois` exclut `installmentsTotal === 1`, mais
    // `isDueInPeriod` non : le paiement unique traverse la vue caisse, et
    // index 0 y est l'index de la dernière échéance. Le chemin est nouveau,
    // le résultat doit être identique.
    expect(installmentIndexAt(paiementUnique, { year: 2026, month: 3 })).toBe(0);
    expect(installmentAmountAt(paiementUnique, 0)).toBe(340);

    const total = aPayerCeMois(
      obligationsDuMois({
        charges: [],
        chargePayments: new Map(),
        commitments: [nomme(paiementUnique, 'Amende')],
        paidKeysByCommitment: vide,
        ref: { year: 2026, month: 3 },
      }),
    );
    expect(total.toNumber()).toBe(340);
  });

  it('hors de la fenêtre, l’index sort des bornes et le montant reste le régulier', () => {
    // Pas de clamp, délibérément : un clamp ferait rendre le montant FINAL à un
    // mois hors fenêtre, ce que `installmentAmountAt` ne fait pas. Les deux
    // réponses hors-domaine doivent concorder.
    const avant = installmentIndexAt(planAvecResidu, { year: 2025, month: 12 });
    expect(avant).toBe(-1);
    expect(installmentAmountAt(planAvecResidu, avant)).toBe(220);

    const apres = installmentIndexAt(planAvecResidu, { year: 2027, month: 6 });
    expect(apres).toBe(17);
    expect(installmentAmountAt(planAvecResidu, apres)).toBe(220);
  });

  it('le restant dû et le solde final sont d’accord par construction', () => {
    // `remainingBalance` fait `total − régulière × payées`. Après 10 pointages
    // sur 11, il doit atterrir exactement sur `lastInstallmentAmount`. L'accord
    // est arithmétique, mais il n'était prouvé nulle part.
    const dixPayees = pointe(
      planAvecResidu,
      Array.from({ length: 10 }, (_, i) => periodKey(2026, i + 1)),
    );
    expect(remainingBalance(planAvecResidu, dixPayees.get('plan') ?? new Set())).toBe(
      lastInstallmentAmount(planAvecResidu),
    );
    expect(lastInstallmentAmount(planAvecResidu)).toBe(200);
  });
});
