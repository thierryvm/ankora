import { describe, expect, it } from 'vitest';

import {
  endInstallmentDate,
  endOrdinal,
  endPeriod,
  firstInstallmentDate,
  installmentPeriods,
  remainingBalance,
  type Commitment,
} from '../index';

/**
 * Les deux aperçus de `CommitmentsClient` doivent s'accorder avec le domaine.
 *
 * Il y en a deux, et ils sont légitimes : `draftWindow` répond à « à quoi
 * ressemblera cet engagement si je le crée », `editConsequence` à « qu'est-ce
 * que ma modification change ». Deux moments du parcours, deux besoins.
 *
 * Le risque n'est donc pas qu'ils coexistent, c'est qu'ils **dérivent**. Ce
 * dépôt a déjà porté trois calculs concurrents de la même fenêtre — le
 * troisième, `engagements-lisses.ts`, refaisait `start + (total − 1) · step`
 * dans son coin et a été supprimé le 2 août 2026. Rien n'empêchait alors d'en
 * réintroduire un quatrième dans un composant.
 *
 * Ce fichier est ce qui l'empêche : pour un MÊME engagement, la fenêtre et le
 * solde vus à la création, vus à la modification, et calculés par le domaine
 * doivent être le même nombre. Si quelqu'un réécrit l'arithmétique dans un
 * `useMemo`, l'un des trois décrochera ici.
 */

const base: Commitment = {
  id: 'test',
  kind: 'debt',
  totalAmount: 1200,
  installmentAmount: null,
  installmentsTotal: 12,
  startYear: 2026,
  startMonth: 5,
  paymentDay: 15,
  frequency: 'monthly',
  isActive: true,
};

describe('les deux aperçus s’accordent avec le domaine', () => {
  it('la fenêtre de création et la fenêtre de modification sont la même', () => {
    // `draftWindow` lit les DATES, `editConsequence` lit les PÉRIODES. Deux
    // représentations de la même échéance : elles doivent désigner le même mois.
    const first = firstInstallmentDate(base);
    const last = endInstallmentDate(base);
    const end = endPeriod(base);

    expect({ year: last.year, month: last.month }).toEqual(end);
    expect({ year: first.year, month: first.month }).toEqual({ year: 2026, month: 5 });
    expect(end).toEqual({ year: 2027, month: 4 });
  });

  it('la fin dérivée est celle de la liste des échéances, jamais recalculée à part', () => {
    // Le piège historique : `start + (total − 1) · step` réécrit à la main.
    // Ici on compare à la DERNIÈRE échéance réellement engendrée.
    for (const frequency of ['monthly', 'quarterly', 'semiannual', 'annual'] as const) {
      for (const installmentsTotal of [1, 2, 5, 12, 35]) {
        const c = { ...base, frequency, installmentsTotal };
        const periods = installmentPeriods(c);
        expect(periods).toHaveLength(installmentsTotal);
        expect(endPeriod(c)).toEqual(periods[periods.length - 1]);
        expect(endOrdinal(c)).toBe(
          c.startYear * 12 +
            (c.startMonth - 1) +
            (installmentsTotal - 1) *
              ({ monthly: 1, quarterly: 3, semiannual: 6, annual: 12 } as const)[frequency],
        );
      }
    }
  });

  it('le solde résiduel vient du domaine, en Decimal — pas de flottant natif', () => {
    // 1200 € en 35 mensualités : 34,285714… € l'une. Le flottant natif rend
    // 207.92999999999984 sur ce type de reste ; le domaine doit rendre 2 décimales.
    const c = { ...base, totalAmount: 1200, installmentsTotal: 35 };
    const paid = new Set(
      installmentPeriods(c)
        .slice(0, 29)
        .map((p) => `${p.year}-${p.month}`),
    );
    const solde = remainingBalance(c, paid);

    expect(Number.isFinite(solde)).toBe(true);
    expect(solde).toBe(Number(solde.toFixed(2)));
    expect(String(solde)).not.toMatch(/\d{6,}$/);
  });

  it('un engagement entièrement pointé vaut zéro, jamais un résidu d’arrondi', () => {
    const c = { ...base, totalAmount: 100, installmentsTotal: 3 };
    const toutes = new Set(installmentPeriods(c).map((p) => `${p.year}-${p.month}`));
    expect(remainingBalance(c, toutes)).toBe(0);
  });

  it('modifier le nombre d’échéances déplace la fin ET le solde, de façon cohérente', () => {
    // C'est exactement ce que `editConsequence` affiche avant validation.
    const avant = { ...base, installmentsTotal: 35 };
    const apres = { ...avant, installmentsTotal: 34 };
    const paid = new Set<string>();

    expect(endPeriod(apres)).not.toEqual(endPeriod(avant));
    expect(endPeriod(apres)).toEqual(installmentPeriods(apres)[33]);
    // Le total dû ne change pas quand seul le nombre d'échéances bouge : c'est
    // la mensualité qui s'ajuste. Un aperçu qui montrerait un solde différent
    // mentirait sur ce que la modification fait.
    expect(remainingBalance(apres, paid)).toBe(remainingBalance(avant, paid));
  });
});
