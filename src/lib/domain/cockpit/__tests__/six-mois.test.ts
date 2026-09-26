import { describe, expect, it } from 'vitest';

import * as Obligations from '@/lib/domain/obligations';
import { computeMonthlyTransferPlan } from '@/lib/domain/transfer';
import { money, type Charge, type Expense } from '@/lib/domain/types';

import { depensesDuMois } from '../depenses-du-mois';
import { sixMois, type SixMoisInput } from '../six-mois';

// Fictitious household (public repo): the 505 € / 705 € family.
const loyer: Charge = {
  id: 'c-loyer',
  label: 'Loyer',
  amount: money(705),
  frequency: 'monthly',
  dueMonth: 1,
  paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  paymentDay: 1,
  categoryId: null,
  isActive: true,
  paidFrom: 'principal',
};
const assurance: Charge = {
  id: 'c-assurance',
  label: 'Assurance auto',
  amount: money(505),
  frequency: 'annual',
  dueMonth: 8,
  paymentMonths: [8],
  paymentDay: 10,
  categoryId: null,
  isActive: true,
  paidFrom: 'epargne',
};
const charges = [loyer, assurance];

const expense = (id: string, occurredOn: string, amount: number): Expense => ({
  id,
  label: 'Courses',
  amount: money(amount),
  occurredOn,
  categoryId: null,
  note: null,
  paidFrom: 'principal',
});

function input(overrides: Partial<SixMoisInput> = {}): SixMoisInput {
  return {
    fin: { year: 2026, month: 10 },
    moisCourant: { year: 2026, month: 9 },
    charges,
    cockpitCharges: charges.map((c) => ({
      id: c.id,
      label: c.label,
      amount: c.amount,
      frequency: c.frequency,
      paymentMonths: c.paymentMonths,
      paymentDay: c.paymentDay,
      isActive: c.isActive,
    })),
    commitments: [],
    paidKeysByCommitment: new Map(),
    monthlyIncome: money(2500),
    vieCouranteMonthlyTransfer: money(0),
    activite: (ref) => ({
      payments: ref.month === 9 ? [{ chargeId: 'c-loyer', periodYear: 2026, periodMonth: 9 }] : [],
      expenses:
        ref.month === 10
          ? []
          : [expense(`e-${ref.month}`, `2026-${String(ref.month).padStart(2, '0')}-12`, 50.5)],
    }),
    ...overrides,
  };
}

describe('sixMois — six months ending on the viewed month', () => {
  it('returns the six months, oldest first, ending on `fin`', () => {
    const S = sixMois(input());
    expect(S.map((m) => `${m.ref.year}-${m.ref.month}`)).toEqual([
      '2026-5',
      '2026-6',
      '2026-7',
      '2026-8',
      '2026-9',
      '2026-10',
    ]);
    expect(S.map((m) => m.statut)).toEqual([
      'passe',
      'passe',
      'passe',
      'passe',
      'en-cours',
      'a-venir',
    ]);
  });

  it('each sub-total is the domain function it calls, for that month', () => {
    const inp = input();
    const S = sixMois(inp);
    const aout = S[3]!;
    const ref = { year: 2026, month: 8 };
    const obligations = Obligations.obligationsDuMois({
      charges: inp.cockpitCharges,
      chargePayments: new Map(),
      commitments: [],
      paidKeysByCommitment: new Map(),
      ref,
    });
    expect(aout.factures.total.toString()).toBe(Obligations.aPayerCeMois(obligations).toString());
    expect(aout.factures.total.toString()).toBe('1210');
    const act = inp.activite(ref);
    expect(aout.depenses?.total.toString()).toBe(depensesDuMois(act.expenses, ref).toString());
    const plan = computeMonthlyTransferPlan({
      charges,
      month: 8,
      monthlyIncome: money(2500),
      vieCouranteMonthlyTransfer: money(0),
      commitmentsDue: money(0),
    });
    expect(aout.provisions.net.toString()).toBe(plan.epargneTransferNet.toString());
    expect(aout.provisions.cible.toString()).toBe(plan.epargneProvisionTarget.toString());
    expect(aout.provisions.facturesDues.toString()).toBe(plan.epargneBillsDue.toString());
    // 1210 + 50.5 + (505/12 − 505) = 797.33… — a REPRISE on the provisions.
    expect(aout.provisions.net.isNegative()).toBe(true);
    expect(aout.total.toString()).toBe(
      aout.factures.total.plus(50.5).plus(aout.provisions.net).toString(),
    );
  });

  it('a month to come has no spending yet: dépenses null, total « au moins »', () => {
    const oct = sixMois(input()).at(-1)!;
    expect(oct.depenses).toBeNull();
    expect(oct.auMoins).toBe(true);
    expect(oct.total.toString()).toBe(oct.factures.total.plus(oct.provisions.net).toString());
  });

  it('flags a past month whose bills carry no recorded payment — never « unpaid »', () => {
    const S = sixMois(input());
    expect(S[0]!.factures.paiementsNonEnregistres).toBe(true); // May: nothing recorded
    expect(S[4]!.factures.paiementsNonEnregistres).toBe(false); // September: current month
    const paidInMay = sixMois(
      input({
        activite: (ref) => ({
          payments:
            ref.month === 5 ? [{ chargeId: 'c-loyer', periodYear: 2026, periodMonth: 5 }] : [],
          expenses: [],
        }),
      }),
    );
    expect(paidInMay[0]!.factures.paiementsNonEnregistres).toBe(false);
  });

  it('one recorded payment among several bills is enough: the month is not flagged', () => {
    const edf: Charge = { ...loyer, id: 'c-edf', label: 'Électricité', amount: money(95) };
    const inp = input({
      charges: [loyer, edf],
      activite: (ref) => ({
        payments: ref.month === 5 ? [{ chargeId: 'c-edf', periodYear: 2026, periodMonth: 5 }] : [],
        expenses: [],
      }),
    });
    const withEdf = {
      ...inp,
      cockpitCharges: [
        ...inp.cockpitCharges,
        { ...inp.cockpitCharges[0]!, id: 'c-edf', label: 'Électricité', amount: money(95) },
      ],
    };
    const S = sixMois(withEdf);
    expect(S[0]!.factures.lignes.filter((o) => o.source === 'charge')).toHaveLength(2);
    expect(S[0]!.factures.paiementsNonEnregistres).toBe(false); // May: one of two recorded
    expect(S[1]!.factures.paiementsNonEnregistres).toBe(true); // June: none recorded
  });

  it('the gap to the previous month is null when either month is incomplete or first', () => {
    const S = sixMois(input());
    expect(S[0]!.ecartMoisPrecedent).toBeNull();
    expect(S[1]!.ecartMoisPrecedent?.toString()).toBe(S[1]!.total.minus(S[0]!.total).toString());
    expect(S[5]!.ecartMoisPrecedent).toBeNull();
  });

  it('crosses a year boundary', () => {
    const S = sixMois(input({ fin: { year: 2027, month: 2 } }));
    expect(S.map((m) => `${m.ref.year}-${m.ref.month}`)).toEqual([
      '2026-9',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-1',
      '2027-2',
    ]);
  });
});
