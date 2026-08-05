import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

import {
  chargesFixesDuMois,
  lissageDuMois,
  provisionsMensuellesLissees,
  totalChargesMensuelles,
  type Poste,
} from '@/lib/domain/cockpit/effort-financier-lisse';
import {
  engagementsDuMois,
  engagementsMensuelsLisses,
} from '@/lib/domain/cockpit/engagements-lisses';
import type { CockpitCharge } from '@/lib/domain/cockpit/types';
import type { NamedCommitment } from '@/lib/domain/obligations/types';

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

const engagement = (over: Partial<NamedCommitment>): NamedCommitment =>
  ({
    id: over.id ?? 'e-' + Math.random().toString(36).slice(2),
    label: 'Engagement',
    isActive: true,
    frequency: 'monthly',
    installmentAmount: 100,
    installmentsTotal: 12,
    installmentsPaid: 0,
    startYear: 2026,
    startMonth: 1,
    ...over,
  }) as NamedCommitment;

const ref = { year: 2026, month: 6 } as const;

/**
 * L'invariant de la règle 10 : un total affiché doit être exactement la somme
 * de ce qu'on montre quand on l'ouvre.
 *
 * Il ne se vérifie pas en lisant le code — les deux nombres y sont produits par
 * la même fonction, donc la lecture dit toujours oui. Il se vérifie en cassant
 * volontairement l'un des deux, ce que fait la §« Falsification » plus bas.
 */
const assertInvariant = (poste: Poste, totalIndependant: Decimal) => {
  const sommeDesParts = poste.parts.reduce((a, p) => a.plus(p.montantMensuel), new Decimal(0));
  // Comparaison Decimal, pas toNumber() : arrondir avant de comparer masquerait
  // exactement l'écart qu'on cherche.
  expect(sommeDesParts.equals(poste.total)).toBe(true);
  expect(poste.total.equals(totalIndependant)).toBe(true);
};

describe('décomposition — Σ parts === total', () => {
  it('charges fixes : liste vide', () => {
    assertInvariant(chargesFixesDuMois([]), totalChargesMensuelles([]));
    expect(chargesFixesDuMois([]).parts).toHaveLength(0);
  });

  it('lissage : liste vide', () => {
    assertInvariant(lissageDuMois([]), provisionsMensuellesLissees([]));
  });

  it('charges fixes : ignore les charges inactives ET les périodiques', () => {
    const charges = [
      charge({ amount: new Decimal(900), frequency: 'monthly' }),
      charge({ amount: new Decimal(150), frequency: 'monthly' }),
      charge({ amount: new Decimal(500), frequency: 'monthly', isActive: false }),
      charge({ amount: new Decimal(300), frequency: 'quarterly' }),
    ];
    const poste = chargesFixesDuMois(charges);
    assertInvariant(poste, totalChargesMensuelles(charges));
    expect(poste.parts).toHaveLength(2);
    expect(poste.total.toNumber()).toBe(1050);
  });

  it('lissage : une part par charge périodique, avec son origine', () => {
    const charges = [
      charge({ amount: new Decimal(900), frequency: 'monthly' }),
      charge({
        id: 'auto',
        label: 'Assurance auto',
        amount: new Decimal(300),
        frequency: 'quarterly',
      }),
      charge({ id: 'taxe', label: 'Taxe', amount: new Decimal(240), frequency: 'annual' }),
      charge({ amount: new Decimal(600), frequency: 'annual', isActive: false }),
    ];
    const poste = lissageDuMois(charges);
    assertInvariant(poste, provisionsMensuellesLissees(charges));
    expect(poste.parts).toHaveLength(2);
    expect(poste.total.toNumber()).toBe(120); // 300/3 + 240/12

    const auto = poste.parts.find((p) => p.id === 'auto');
    expect(auto?.libelle).toBe('Assurance auto');
    expect(auto?.montantMensuel.toNumber()).toBe(100);
    // C'est CE champ qui répond à « à quoi correspondent ces 100 € ? ».
    expect(auto?.origine?.montantFacture.toNumber()).toBe(300);
    expect(auto?.origine?.cycleMois).toBe(3);
  });

  it('charges fixes : origine null — 150 €/mois n’a rien à expliquer', () => {
    const poste = chargesFixesDuMois([charge({ amount: new Decimal(150) })]);
    expect(poste.parts[0]?.origine).toBeNull();
  });

  it('lissage : un tiers non représentable en base 10 ne perd rien', () => {
    // 100 € par trimestre = 33,333… €/mois. Une part arrondie ferait diverger
    // la somme du total dès la deuxième charge.
    const charges = [
      charge({ amount: new Decimal(100), frequency: 'quarterly' }),
      charge({ amount: new Decimal(100), frequency: 'quarterly' }),
      charge({ amount: new Decimal(100), frequency: 'quarterly' }),
    ];
    const poste = lissageDuMois(charges);
    assertInvariant(poste, provisionsMensuellesLissees(charges));
    expect(poste.total.toNumber()).toBe(100);
  });

  it('engagements : le filtre du total et celui des parts sont le même', () => {
    const commitments = [
      engagement({ id: 'pret', label: 'Prêt auto', installmentAmount: 220 }),
      // Paiement unique : exclu par ADR-021, il n'est pas une charge récurrente.
      engagement({ id: 'oneoff', label: 'One-off', installmentsTotal: 1, installmentAmount: 900 }),
      engagement({ id: 'inactif', label: 'Inactif', isActive: false, installmentAmount: 400 }),
      // Terminé avant le mois de référence : la fenêtre l'exclut.
      engagement({
        id: 'fini',
        label: 'Fini',
        startYear: 2025,
        startMonth: 1,
        installmentsTotal: 3,
      }),
    ];
    const paid = new Map<string, ReadonlySet<string>>();
    const poste = engagementsDuMois(commitments, paid, ref);
    assertInvariant(poste, engagementsMensuelsLisses(commitments, paid, ref));
    expect(poste.parts.map((p) => p.id)).toEqual(['pret']);
    expect(poste.total.toNumber()).toBe(220);
  });

  it('engagements : une cadence trimestrielle explique sa division', () => {
    const commitments = [
      engagement({ id: 'plan', label: 'Plan', frequency: 'quarterly', installmentAmount: 600 }),
    ];
    const paid = new Map<string, ReadonlySet<string>>();
    const poste = engagementsDuMois(commitments, paid, ref);
    assertInvariant(poste, engagementsMensuelsLisses(commitments, paid, ref));
    expect(poste.parts[0]?.montantMensuel.toNumber()).toBe(200);
    expect(poste.parts[0]?.origine).toEqual({
      montantFacture: new Decimal(600),
      cycleMois: 3,
    });
  });

  it('engagements : une mensualité n’a pas d’origine à expliquer', () => {
    const paid = new Map<string, ReadonlySet<string>>();
    const poste = engagementsDuMois([engagement({ installmentAmount: 220 })], paid, ref);
    expect(poste.parts[0]?.origine).toBeNull();
  });
});

/**
 * Falsification — la partie qui donne sa valeur au reste.
 *
 * Les tests ci-dessus passeraient tous si `total` et `parts` étaient calculés
 * par deux chemins qui divergent : rien ne le prouve tant qu'on n'a pas montré
 * qu'un écart les fait rougir. Ces deux cas construisent l'écart à la main.
 */
describe('décomposition — falsification de l’invariant', () => {
  it('une part retirée fait échouer l’invariant', () => {
    const charges = [
      charge({ amount: new Decimal(300), frequency: 'quarterly' }),
      charge({ amount: new Decimal(240), frequency: 'annual' }),
    ];
    const vrai = lissageDuMois(charges);
    const ampute: Poste = { total: vrai.total, parts: vrai.parts.slice(1) };
    expect(() => assertInvariant(ampute, vrai.total)).toThrow();
  });

  it('une part en trop fait échouer l’invariant', () => {
    const charges = [charge({ amount: new Decimal(300), frequency: 'quarterly' })];
    const vrai = lissageDuMois(charges);
    const gonfle: Poste = {
      total: vrai.total,
      parts: [
        ...vrai.parts,
        { id: 'fantome', libelle: 'Fantôme', montantMensuel: new Decimal(1), origine: null },
      ],
    };
    expect(() => assertInvariant(gonfle, vrai.total)).toThrow();
  });
});
