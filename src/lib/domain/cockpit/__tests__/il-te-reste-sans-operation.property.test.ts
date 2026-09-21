import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import fc from 'fast-check';

import { effortFinancierLisse } from '@/lib/domain/cockpit/effort-financier-lisse';
import { epargneEstimee } from '@/lib/domain/cockpit/epargne-estimee';
import { operationsDuMois } from '@/lib/domain/cockpit/operations-du-mois';
import { calculerSanteProvisions } from '@/lib/domain/cockpit/sante-provisions';
import { calculerSituationDuMois } from '@/lib/domain/cockpit/situation-mois';
import type {
  CockpitCharge,
  CockpitFrequency,
  PaymentLedger,
  ReferencePeriod,
} from '@/lib/domain/cockpit/types';

/**
 * PR D — the invariant that protects the people already signed up.
 *
 * Every production workspace has ZERO operation today (measured by the pilot).
 * For them, the new formula of « Il te reste » must give EXACTLY the old one,
 * to the cent. The old calculation lives here, and only here, as the oracle:
 * it is the composition `situation-mois.ts` used before PR D, copied line for
 * line, so the production code can change without taking its judge with it.
 */
function ancienCalcul(input: {
  revenus: Decimal | null;
  charges: readonly CockpitCharge[];
  soldeEpargneActuel: Decimal;
  payments: PaymentLedger;
  ref: ReferencePeriod;
  engagementsMensuels: Decimal;
  depensesDuMois: Decimal;
  joursEcoules: number;
  joursDuMois: number;
}) {
  const hasRevenus = input.revenus !== null;
  const revenus = input.revenus ?? new Decimal(0);
  const effort = effortFinancierLisse(input.charges);
  const resteAvantEngagements = revenus.minus(effort);
  const sante = calculerSanteProvisions({
    charges: input.charges,
    payments: input.payments,
    soldeEpargneActuel: input.soldeEpargneActuel,
    ref: input.ref,
  });
  const provisionsAJour = sante.statut === 'a_jour';
  const resteDisponible = resteAvantEngagements.minus(input.engagementsMensuels);
  const ilTeReste = resteDisponible.minus(input.depensesDuMois);
  const epargne = epargneEstimee({
    budgetDuMois: resteDisponible,
    depensesDuMois: input.depensesDuMois,
    joursEcoules: input.joursEcoules,
    joursDuMois: input.joursDuMois,
  });
  let statut: 'vert' | 'orange' | 'rouge' | 'incomplet';
  if (!hasRevenus) statut = 'incomplet';
  else if (resteDisponible.lt(0)) statut = 'rouge';
  else if (ilTeReste.lt(0) || !provisionsAJour) statut = 'orange';
  else statut = 'vert';
  return { revenus, resteDisponible, ilTeReste, epargne, statut };
}

const FREQUENCES: CockpitFrequency[] = ['monthly', 'quarterly', 'semiannual', 'annual'];
const MOIS_PAR_FREQUENCE: Record<CockpitFrequency, number[]> = {
  monthly: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  quarterly: [3, 6, 9, 12],
  semiannual: [4, 10],
  annual: [11],
};

/** Cents as integers, turned into Decimal: never a float on the way. */
const centimes = (max: number) =>
  fc.integer({ min: 0, max }).map((c) => new Decimal(c).dividedBy(100));

const chargeArb = fc
  .record({
    id: fc.uuid(),
    amount: centimes(300_000),
    frequency: fc.constantFrom(...FREQUENCES),
    isActive: fc.boolean(),
  })
  .map((c): CockpitCharge => ({
    ...c,
    label: 'Facture fictive',
    paymentMonths: MOIS_PAR_FREQUENCE[c.frequency],
    paymentDay: 5,
  }));

const etatArb = fc.record({
  revenus: fc.option(centimes(1_000_000), { nil: null }),
  charges: fc.array(chargeArb, { maxLength: 8 }),
  soldeEpargneActuel: centimes(2_000_000),
  engagementsMensuels: centimes(200_000),
  depensesDuMois: centimes(500_000),
  joursDuMois: fc.constantFrom(28, 29, 30, 31),
  jour: fc.integer({ min: 1, max: 31 }),
  mois: fc.integer({ min: 1, max: 12 }),
  payes: fc.array(fc.boolean(), { maxLength: 8 }),
});

describe('« Il te reste » with ZERO operation — new formula == old formula, to the cent', () => {
  it('holds for generated workspaces', () => {
    fc.assert(
      fc.property(etatArb, (e) => {
        const ref: ReferencePeriod = { year: 2026, month: e.mois };
        const payments: PaymentLedger = new Map(
          e.charges.map((c, i) => [`${c.id}-${ref.year}-${ref.month}`, e.payes[i] === true]),
        );
        const commun = {
          revenus: e.revenus,
          charges: e.charges,
          soldeEpargneActuel: e.soldeEpargneActuel,
          payments,
          ref,
          engagementsMensuels: e.engagementsMensuels,
          depensesDuMois: e.depensesDuMois,
          joursEcoules: Math.min(e.jour, e.joursDuMois),
          joursDuMois: e.joursDuMois,
        };
        const ancien = ancienCalcul(commun);
        const nouveau = calculerSituationDuMois({
          ...commun,
          operations: operationsDuMois([], ref),
        });

        // `equals`, not a rounded string: « exactly the old one ».
        expect(nouveau.ilTeReste.equals(ancien.ilTeReste)).toBe(true);
        expect(nouveau.resteDisponible.equals(ancien.resteDisponible)).toBe(true);
        expect(nouveau.revenus.equals(ancien.revenus)).toBe(true);
        expect(nouveau.statut).toBe(ancien.statut);
        if (ancien.epargne === null) expect(nouveau.epargneEstimee).toBeNull();
        else expect(nouveau.epargneEstimee?.equals(ancien.epargne)).toBe(true);
        expect(nouveau.misDeCote.isZero()).toBe(true);
        expect(nouveau.auDelaDuRevenu.isZero()).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});
