import { describe, expect, it } from 'vitest';

import { depensesDuMois } from '@/lib/domain/cockpit/depenses-du-mois';
import { depensesParJour } from '@/lib/domain/cockpit/depenses-par-jour';
import { sixMois } from '@/lib/domain/cockpit/six-mois';
import { categoriesDuMois } from '@/lib/domain/expenses/categories-du-mois';
import { money } from '@/lib/domain/types';

import { depensesDuMoisDeBudget, fenetreDuMoisDeBudget } from '../mois-de-budget';
import {
  DEPENSES,
  IDS_OCTOBRE,
  IDS_SEPTEMBRE,
  OCTOBRE,
  SALAIRE_OCTOBRE,
  SEPTEMBRE,
} from './fixture-mois-de-budget';

/** ADR-047 — every reader of « the expenses of the month » gets the same split. */
const REVENUS = [SALAIRE_OCTOBRE];

describe('the readers of the month expenses follow ONE ranging (ADR-047)', () => {
  it('« Dépensé » of « Il te reste »: September 55, October 65', () => {
    expect(depensesDuMois(DEPENSES, SEPTEMBRE, REVENUS).toNumber()).toBe(55);
    expect(depensesDuMois(DEPENSES, OCTOBRE, REVENUS).toNumber()).toBe(65);
    expect(depensesDuMoisDeBudget(DEPENSES, OCTOBRE, REVENUS).map((d) => d.id)).toEqual(
      IDS_OCTOBRE,
    );
    expect(depensesDuMoisDeBudget(DEPENSES, SEPTEMBRE, REVENUS).map((d) => d.id)).toEqual(
      IDS_SEPTEMBRE,
    );
  });

  it('Rythme du mois: October counts from 28 September, 34 days, and ends at 65', () => {
    const fenetre = fenetreDuMoisDeBudget(OCTOBRE, REVENUS);
    const serie = depensesParJour(
      depensesDuMoisDeBudget(DEPENSES, OCTOBRE, REVENUS),
      OCTOBRE,
      fenetre.jours,
      fenetre.debut,
    );
    expect(serie).toHaveLength(34);
    expect(serie[0]).toEqual({ jour: 1, duJour: 25, cumule: 25 });
    expect(serie[1]).toEqual({ jour: 2, duJour: 30, cumule: 55 });
    expect(serie[5]).toEqual({ jour: 6, duJour: 10, cumule: 65 });
    expect(serie.at(-1)?.cumule).toBe(65);
  });

  it('Catégories: the October card adds up to 65', () => {
    const groupes = categoriesDuMois(depensesDuMoisDeBudget(DEPENSES, OCTOBRE, REVENUS), []);
    const total = groupes.reduce((s, g) => s + g.total.toNumber(), 0);
    expect(total).toBe(65);
  });

  it('Six mois: September 55 and October 65, lines and totals from one list', () => {
    const serie = sixMois({
      fin: OCTOBRE,
      moisCourant: OCTOBRE,
      charges: [],
      cockpitCharges: [],
      commitments: [],
      paidKeysByCommitment: new Map(),
      monthlyIncome: money(2000),
      vieCouranteMonthlyTransfer: money(0),
      // Each month receives its calendar month and the one before, as read.
      activite: () => ({ payments: [], expenses: DEPENSES }),
      revenus: REVENUS,
    });
    const oct = serie.find((m) => m.ref.month === 10)!;
    const sept = serie.find((m) => m.ref.month === 9)!;
    expect(oct.depenses?.total.toNumber()).toBe(65);
    expect(oct.depenses?.lignes.map((d) => d.id)).toEqual(IDS_OCTOBRE);
    expect(sept.depenses?.total.toNumber()).toBe(55);
    expect(sept.depenses?.lignes.map((d) => d.id)).toEqual(IDS_SEPTEMBRE);
  });
});
