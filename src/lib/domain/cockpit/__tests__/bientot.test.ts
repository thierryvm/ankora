import { describe, it, expect } from 'vitest';

import {
  facturesBientot,
  partMensuelle,
  FENETRE_BIENTOT_JOURS,
  type ChargeBientot,
} from '../bientot';
import { money } from '../../types';

/**
 * « Bientôt » — les factures non mensuelles qui tombent hors du mois courant.
 *
 * Jusqu'ici, le cockpit ne montrait une telle facture QUE si son propriétaire
 * l'avait cochée « à surveiller » à la main (`is_watched`). Une facture
 * trimestrielle jamais cochée n'était dite nulle part : elle arrivait sans
 * prévenir. Le constat est écrit dans DESIGN-v3.md — la facture d'eau
 * d'octobre, 45 € trimestriels, invisible au cockpit.
 *
 * Ce module calcule l'appartenance À LA LECTURE, sur une fenêtre de 60 jours,
 * et garde l'UNION avec la coche tant que /app/charges permet de cocher :
 * quelqu'un qui coche s'attend à revoir sa facture, et aucune fonction ne se
 * perd en route. La coche et sa lecture partiront ensemble, dans une PR de
 * ménage.
 *
 * Vecteurs FICTIFS de bout en bout (dépôt public) : une famille dont le revenu
 * couvre 505 € de factures mensuelles et 705 € de charges au total. Aucun
 * chiffre réel n'entre ici.
 */

const REF = '2026-09-20'; // le jour de référence de tous les cas ci-dessous

function charge(over: Partial<ChargeBientot> & { id: string }): ChargeBientot {
  return {
    id: over.id,
    label: over.label ?? 'Facture',
    amount: over.amount ?? money(45),
    frequency: over.frequency ?? 'quarterly',
    paymentMonths: over.paymentMonths ?? [1, 4, 7, 10],
    paymentDay: over.paymentDay ?? 5,
    isActive: over.isActive ?? true,
    isWatched: over.isWatched,
  };
}

const AUCUN_PAIEMENT: ReadonlyMap<string, boolean> = new Map();

describe('FENETRE_BIENTOT_JOURS', () => {
  it('vaut 60 jours, et rien d’autre', () => {
    // La fenêtre est une décision écrite (@thierry, 19 sept. 2026) : « Bientôt »
    // prend la fenêtre de 60 jours d'« À surveiller », jamais une autre durée.
    expect(FENETRE_BIENTOT_JOURS).toBe(60);
  });
});

describe('facturesBientot — la branche calculée (60 jours)', () => {
  it('retient une facture non mensuelle dont l’échéance tombe DANS la fenêtre', () => {
    // 5 octobre = 15 jours après le 20 septembre.
    const eau = charge({ id: 'eau', label: 'Eau', paymentMonths: [1, 4, 7, 10], paymentDay: 5 });

    const lignes = facturesBientot({
      charges: [eau],
      payments: AUCUN_PAIEMENT,
      todayIso: REF,
      period: { year: 2026, month: 9 },
    });

    expect(lignes.map((l) => l.charge.id)).toEqual(['eau']);
    expect(lignes[0]!.dueDateIso).toBe('2026-10-05');
    expect(lignes[0]!.joursAvant).toBe(15);
    expect(lignes[0]!.raison).toBe('fenetre');
  });

  it('retient le bord INCLUS de la fenêtre (J+60) et rejette J+61', () => {
    // Le bord est la seule partie d'une fenêtre qu'on peut se tromper en
    // écrivant. 2026-11-19 = J+60 ; 2026-11-20 = J+61.
    const auBord = charge({ id: 'bord', paymentMonths: [11], paymentDay: 19, frequency: 'annual' });
    const auDela = charge({ id: 'dela', paymentMonths: [11], paymentDay: 20, frequency: 'annual' });

    const lignes = facturesBientot({
      charges: [auBord, auDela],
      payments: AUCUN_PAIEMENT,
      todayIso: REF,
      period: { year: 2026, month: 9 },
    });

    expect(lignes.map((l) => l.charge.id)).toEqual(['bord']);
    expect(lignes[0]!.joursAvant).toBe(60);
  });

  it('écarte une facture MENSUELLE : elle est déjà dans « Encore à payer »', () => {
    const loyer = charge({
      id: 'loyer',
      label: 'Loyer',
      amount: money(505),
      frequency: 'monthly',
      paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      paymentDay: 1,
    });

    expect(
      facturesBientot({
        charges: [loyer],
        payments: AUCUN_PAIEMENT,
        todayIso: REF,
        period: { year: 2026, month: 9 },
      }),
    ).toEqual([]);
  });

  it('écarte une facture DUE CE MOIS : « Encore à payer » la porte déjà', () => {
    const taxe = charge({
      id: 'taxe',
      paymentMonths: [3, 9],
      paymentDay: 28,
      frequency: 'semiannual',
    });

    expect(
      facturesBientot({
        charges: [taxe],
        payments: AUCUN_PAIEMENT,
        todayIso: REF,
        period: { year: 2026, month: 9 },
      }),
    ).toEqual([]);
  });

  it('écarte une occurrence DÉJÀ PAYÉE et va chercher la suivante', () => {
    const eau = charge({ id: 'eau', paymentMonths: [1, 4, 7, 10], paymentDay: 5 });
    const payee = new Map([['eau-2026-10', true]]);

    // Octobre est payé : la prochaine est janvier 2027, hors des 60 jours.
    expect(
      facturesBientot({
        charges: [eau],
        payments: payee,
        todayIso: REF,
        period: { year: 2026, month: 9 },
      }),
    ).toEqual([]);
  });

  it('écarte une facture inactive', () => {
    const resiliee = charge({ id: 'resiliee', isActive: false });

    expect(
      facturesBientot({
        charges: [resiliee],
        payments: AUCUN_PAIEMENT,
        todayIso: REF,
        period: { year: 2026, month: 9 },
      }),
    ).toEqual([]);
  });

  it('range les lignes de la plus proche à la plus lointaine', () => {
    const loin = charge({ id: 'loin', paymentMonths: [11], paymentDay: 10, frequency: 'annual' });
    const proche = charge({
      id: 'proche',
      paymentMonths: [10],
      paymentDay: 1,
      frequency: 'annual',
    });

    const lignes = facturesBientot({
      charges: [loin, proche],
      payments: AUCUN_PAIEMENT,
      todayIso: REF,
      period: { year: 2026, month: 9 },
    });

    expect(lignes.map((l) => l.charge.id)).toEqual(['proche', 'loin']);
  });
});

describe('facturesBientot — la branche cochée (is_watched), gardée en UNION', () => {
  /**
   * Tant que /app/charges laisse cocher « à surveiller », une facture cochée
   * revient au cockpit même hors fenêtre : sinon, cocher n'aurait plus d'effet
   * visible, et le geste mentirait. Décision de @thierry, 20 sept. 2026.
   */
  it('retient une facture COCHÉE dont l’échéance est AU-DELÀ des 60 jours', () => {
    const impot = charge({
      id: 'impot',
      label: 'Impôt',
      amount: money(200),
      frequency: 'annual',
      paymentMonths: [12],
      paymentDay: 15,
      isWatched: true,
    });

    const lignes = facturesBientot({
      charges: [impot],
      payments: AUCUN_PAIEMENT,
      todayIso: REF,
      period: { year: 2026, month: 9 },
    });

    expect(lignes.map((l) => l.charge.id)).toEqual(['impot']);
    expect(lignes[0]!.joursAvant).toBeGreaterThan(FENETRE_BIENTOT_JOURS);
    expect(lignes[0]!.raison).toBe('cochee');
  });

  it('ne compte PAS deux fois une facture à la fois cochée et dans la fenêtre', () => {
    const eau = charge({ id: 'eau', paymentMonths: [10], paymentDay: 5, isWatched: true });

    const lignes = facturesBientot({
      charges: [eau],
      payments: AUCUN_PAIEMENT,
      todayIso: REF,
      period: { year: 2026, month: 9 },
    });

    expect(lignes).toHaveLength(1);
    // La fenêtre prime : c'est la raison la plus forte, et celle qui survivra
    // à la disparition de la coche.
    expect(lignes[0]!.raison).toBe('fenetre');
  });

  it('n’exempte pas une facture cochée des autres filtres (mensuelle, due ce mois)', () => {
    const loyer = charge({
      id: 'loyer',
      frequency: 'monthly',
      paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      paymentDay: 1,
      isWatched: true,
    });
    const dueCeMois = charge({
      id: 'due',
      paymentMonths: [3, 9],
      paymentDay: 28,
      frequency: 'semiannual',
      isWatched: true,
    });

    expect(
      facturesBientot({
        charges: [loyer, dueCeMois],
        payments: AUCUN_PAIEMENT,
        todayIso: REF,
        period: { year: 2026, month: 9 },
      }),
    ).toEqual([]);
  });
});

describe('partMensuelle — une part ne se montre jamais sans sa facture', () => {
  /**
   * Règle 10 du CLAUDE.md, appliquée à l'envers : le chiffre mensuel (15 €)
   * est un QUOTIENT, et un quotient sans son dividende ni son diviseur est
   * une injonction. « 45 € tous les 3 mois → 15,00 € par mois » porte les
   * trois nombres, donc il se vérifie de tête.
   */
  it('rend le montant de la facture, la longueur du cycle et la part, pour une trimestrielle', () => {
    const eau = charge({ id: 'eau', amount: money(45), frequency: 'quarterly' });

    const part = partMensuelle(eau);

    expect(part).not.toBeNull();
    expect(part!.montantFacture.toNumber()).toBe(45);
    expect(part!.cycleMois).toBe(3);
    expect(part!.montantMensuel.toNumber()).toBe(15);
  });

  it('rend la part d’une annuelle et d’une semestrielle', () => {
    const annuelle = charge({ id: 'a', amount: money(240), frequency: 'annual' });
    const semestrielle = charge({ id: 's', amount: money(120), frequency: 'semiannual' });

    expect(partMensuelle(annuelle)!.cycleMois).toBe(12);
    expect(partMensuelle(annuelle)!.montantMensuel.toNumber()).toBe(20);
    expect(partMensuelle(semestrielle)!.cycleMois).toBe(6);
    expect(partMensuelle(semestrielle)!.montantMensuel.toNumber()).toBe(20);
  });

  it('rend null pour une mensuelle : elle ne subit aucune division', () => {
    const loyer = charge({ id: 'loyer', amount: money(505), frequency: 'monthly' });

    expect(partMensuelle(loyer)).toBeNull();
  });

  it('garde la précision du quotient plutôt qu’un arrondi d’affichage', () => {
    // 100 ÷ 3 : le cockpit affichera 33,33 €, mais le domaine ne perd rien —
    // additionner douze arrondis donnerait 399,96 € au lieu de 400 €.
    const tiers = charge({ id: 'tiers', amount: money(100), frequency: 'quarterly' });

    expect(partMensuelle(tiers)!.montantMensuel.toFixed(4)).toBe('33.3333');
  });

  it('chaque ligne de « Bientôt » porte sa part mensuelle, sans exception', () => {
    // C'est l'invariant qui compte : une ligne de « Bientôt » est, par
    // construction, une facture non mensuelle — donc elle a TOUJOURS une part,
    // et l'affichage ne peut pas se retrouver avec un trou à combler.
    const factures = [
      charge({
        id: 'eau',
        amount: money(45),
        frequency: 'quarterly',
        paymentMonths: [10],
        paymentDay: 5,
      }),
      charge({
        id: 'assurance',
        amount: money(240),
        frequency: 'annual',
        paymentMonths: [11],
        paymentDay: 2,
        isWatched: true,
      }),
      charge({
        id: 'taxe',
        amount: money(120),
        frequency: 'semiannual',
        paymentMonths: [5, 11],
        paymentDay: 15,
      }),
    ];

    const lignes = facturesBientot({
      charges: factures,
      payments: AUCUN_PAIEMENT,
      todayIso: REF,
      period: { year: 2026, month: 9 },
    });

    expect(lignes.length).toBeGreaterThan(0);
    for (const ligne of lignes) {
      expect(ligne.partMensuelle).not.toBeNull();
      expect(ligne.partMensuelle!.montantMensuel.toNumber()).toBeGreaterThan(0);
      expect(ligne.partMensuelle!.cycleMois).toBeGreaterThan(1);
    }
  });
});
