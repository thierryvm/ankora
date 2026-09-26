import * as Obligations from '@/lib/domain/obligations';
import type { MonthObligation, NamedCommitment } from '@/lib/domain/obligations';
import { computeMonthlyTransferPlan } from '@/lib/domain/transfer';
import type { Charge, Expense, Money } from '@/lib/domain/types';

import { depensesDuMois } from './depenses-du-mois';
import { paymentKey, type CockpitCharge, type PaymentLedger, type ReferencePeriod } from './types';

/**
 * « Six mois » — the six months ending on the viewed month, each read by the
 * functions the cockpit already uses for ONE month.
 *
 * ## No new arithmetic
 *
 * Every sub-total is the result of an existing domain function, called for
 * that month: « Factures » is `aPayerCeMois(obligationsDuMois(...))`, the
 * figure the bills screen ticks; « Dépenses » is `depensesDuMois`, the one
 * « Il te reste » subtracts; « Provisions » is the transfer plan's
 * `epargneTransferNet`, the « virement à faire » of that month — negative when
 * the provisions pay more than they receive (a reprise). The only operations
 * written here are the row total (the three sub-totals added, as the mockup's
 * `moisGraphique` defines it) and the gap to the previous month. Both are
 * shown with their terms, so the figure opens on what composes it (rule 10).
 *
 * ## What « no data » means
 *
 * A month to come has no spending yet: its `depenses` is `null`, never zero,
 * and its total reads « au moins ». A PAST month whose bills carry no recorded
 * payment says so — « Paiements non enregistrés » — and never « non payée »:
 * the absence of a recorded payment is not an unpaid bill (F-24).
 */

export type MonthActivity = Readonly<{
  payments: readonly Readonly<{ chargeId: string; periodYear: number; periodMonth: number }>[];
  expenses: readonly Expense[];
}>;

export type SixMoisInput = Readonly<{
  /** The viewed month: the LAST of the six. */
  fin: ReferencePeriod;
  moisCourant: ReferencePeriod;
  charges: readonly Charge[];
  cockpitCharges: readonly CockpitCharge[];
  commitments: readonly NamedCommitment[];
  paidKeysByCommitment: ReadonlyMap<string, ReadonlySet<string>>;
  monthlyIncome: Money;
  vieCouranteMonthlyTransfer: Money;
  /** The recorded payments and the expenses of one month. */
  activite: (ref: ReferencePeriod) => MonthActivity;
}>;

export type StatutMois = 'passe' | 'en-cours' | 'a-venir';

export type MoisDeLaSerie = Readonly<{
  ref: ReferencePeriod;
  statut: StatutMois;
  factures: Readonly<{
    total: Money;
    lignes: readonly MonthObligation[];
    /** Past month, bills due, not one of them recorded as paid. */
    paiementsNonEnregistres: boolean;
  }>;
  /** `null` for a month to come: nothing is spent yet, which is not zero. */
  depenses: Readonly<{ total: Money; lignes: readonly Expense[] }> | null;
  provisions: Readonly<{ net: Money; cible: Money; facturesDues: Money }>;
  total: Money;
  /** The total is a floor: part of the month is not known yet. */
  auMoins: boolean;
  /** `null` for the first month, or when either month is incomplete. */
  ecartMoisPrecedent: Money | null;
}>;

/** The months `fin − 5 … fin`, oldest first. */
export function moisDeLaFenetre(fin: ReferencePeriod): ReferencePeriod[] {
  return Array.from({ length: 6 }, (_, i) => {
    const index = fin.year * 12 + (fin.month - 1) - (5 - i);
    return { year: Math.floor(index / 12), month: (index % 12) + 1 };
  });
}

const rang = (p: ReferencePeriod) => p.year * 12 + p.month;

function unMois(input: SixMoisInput, ref: ReferencePeriod) {
  const { payments, expenses } = input.activite(ref);
  const statut: StatutMois =
    rang(ref) === rang(input.moisCourant)
      ? 'en-cours'
      : rang(ref) > rang(input.moisCourant)
        ? 'a-venir'
        : 'passe';
  const chargePayments: PaymentLedger = new Map(
    payments.map((p) => [paymentKey(p.chargeId, p.periodYear, p.periodMonth), true]),
  );
  const lignes = Obligations.obligationsDuMois({
    charges: input.cockpitCharges,
    chargePayments,
    commitments: input.commitments,
    paidKeysByCommitment: input.paidKeysByCommitment,
    ref,
  });
  const facturesDuCompte = lignes.filter((o) => o.source === 'charge');
  const paiementsNonEnregistres =
    statut === 'passe' && facturesDuCompte.length > 0 && !facturesDuCompte.some((o) => o.isPaid);
  const plan = computeMonthlyTransferPlan({
    charges: input.charges,
    month: ref.month,
    monthlyIncome: input.monthlyIncome,
    vieCouranteMonthlyTransfer: input.vieCouranteMonthlyTransfer,
    commitmentsDue: Obligations.aPayerCeMois(lignes.filter((o) => o.source === 'commitment')),
  });
  const factures = Obligations.aPayerCeMois(lignes);
  const depenses =
    statut === 'a-venir' ? null : { total: depensesDuMois(expenses, ref), lignes: expenses };
  const total = factures.plus(depenses?.total ?? 0).plus(plan.epargneTransferNet);
  return {
    ref,
    statut,
    factures: { total: factures, lignes, paiementsNonEnregistres },
    depenses,
    provisions: {
      net: plan.epargneTransferNet,
      cible: plan.epargneProvisionTarget,
      facturesDues: plan.epargneBillsDue,
    },
    total,
    auMoins: depenses === null,
  };
}

export function sixMois(input: SixMoisInput): readonly MoisDeLaSerie[] {
  const mois = moisDeLaFenetre(input.fin).map((ref) => unMois(input, ref));
  return mois.map((m, i) => {
    const precedent = i > 0 ? mois[i - 1] : undefined;
    const ecartMoisPrecedent =
      precedent && !m.auMoins && !precedent.auMoins ? m.total.minus(precedent.total) : null;
    return { ...m, ecartMoisPrecedent };
  });
}
