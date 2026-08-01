import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';

import {
  aPayerCeMois,
  detecterDoublonsProbables,
  effortLisse,
  obligationsDuMois,
  resteAPayerCeMois,
  type NamedCommitment,
} from '..';
import { engagementsMensuelsLisses } from '@/lib/domain/cockpit/engagements-lisses';
import {
  paymentKey,
  type CockpitCharge,
  type PaymentLedger,
  type ReferencePeriod,
} from '@/lib/domain/cockpit/types';

/**
 * ONE OBLIGATION, ONE TABLE — the invariant ADR-035 §5 never covered.
 *
 * ## The gap this file closes
 *
 * `pas-de-double-comptage.test.ts` locks « a `charge` or `commitment`
 * occurrence is never an `expense` ». Read it again: `charge` and `commitment`
 * are on the SAME side of that barrier. Their mutual overlap was covered by no
 * invariant, no test and no database constraint — `20260719000001_commitments.sql`
 * has no foreign key towards `charges`.
 *
 * The consequence, measured on @thierry's data: « Impôt 220 € » existed as a
 * monthly charge AND as an SPF commitment. `effortFinancierLisse(charges)`
 * counted it, `engagementsMensuelsLisses(commitments)` counted it again, and
 * « Budget du mois » read 553,79 € instead of 773,79 €. Wrong by 220 €, in the
 * direction that told him he had less than he did.
 *
 * ## The three properties asserted here
 *
 *   1. each view counts an obligation ONCE — the same euro may appear in both
 *      « À payer ce mois » and « Effort lissé », never twice in one of them;
 *   2. the duplicate heuristic WARNS and enters no total — vary the warning,
 *      nothing moves;
 *   3. NON-CONTAMINATION — a redundantly hand-typed figure (a total remembered
 *      as 14 500 € against 60 × 250 = 15 000 €) reaches no cockpit figure.
 *
 * Property 3 is the one that makes human approximation *structurally* unable to
 * touch a displayed number. It is deliberately falsifiable: it varies the
 * redundant field and fails if any aggregate moves.
 */

const REF: ReferencePeriod = { year: 2026, month: 7 };

const charge = (over: Partial<CockpitCharge> = {}): CockpitCharge => ({
  id: 'charge-1',
  label: 'Charge',
  amount: new Decimal(100),
  frequency: 'monthly',
  paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  paymentDay: 5,
  isActive: true,
  ...over,
});

const commitment = (over: Partial<NamedCommitment> = {}): NamedCommitment => ({
  id: 'commitment-1',
  label: 'Engagement',
  kind: 'debt',
  totalAmount: 8750,
  installmentAmount: 250,
  installmentsTotal: 35,
  startYear: 2026,
  startMonth: 7,
  paymentDay: 15,
  frequency: 'monthly',
  isActive: true,
  ...over,
});

const NO_CHARGE_PAYMENTS: PaymentLedger = new Map();
const NO_COMMITMENT_PAYMENTS: ReadonlyMap<string, ReadonlySet<string>> = new Map();

describe('each view counts an obligation exactly once', () => {
  // @thierry's real month, in the CORRECTED model: the 220 € tax is a
  // commitment only, no longer also a charge.
  const charges = [
    charge({ id: 'loyer', label: 'Loyer', amount: new Decimal(1584.21), paymentDay: 1 }),
    charge({
      id: 'assurance',
      label: 'Assurance auto',
      amount: new Decimal(177),
      frequency: 'quarterly',
      paymentMonths: [1, 4, 7, 10],
      paymentDay: 20,
    }),
  ];
  const commitments = [
    commitment({ id: 'spf', label: 'SPF Finances', installmentAmount: 220, totalAmount: 2420 }),
  ];

  const obligations = obligationsDuMois({
    charges,
    chargePayments: NO_CHARGE_PAYMENTS,
    commitments,
    paidKeysByCommitment: NO_COMMITMENT_PAYMENTS,
    ref: REF,
  });

  it('« À payer ce mois » lists every occurrence once, charges and instalments alike', () => {
    expect(obligations.map((o) => o.id)).toEqual(['loyer', 'spf', 'assurance']);
    // 1 584,21 (loyer) + 220 (échéance SPF) + 177 (assurance, due en juillet)
    expect(aPayerCeMois(obligations).toNumber()).toBeCloseTo(1981.21, 2);
  });

  it('« Effort lissé » smooths the same obligations, and also counts each once', () => {
    const engagements = engagementsMensuelsLisses(
      commitments,
      NO_COMMITMENT_PAYMENTS,
      REF,
    );
    // 1 584,21 (mensuel) + 59,00 (177 / 3) + 220,00 (engagement) = 1 863,21
    expect(effortLisse(charges, engagements).toNumber()).toBeCloseTo(1863.21, 2);
  });

  it('the same euro may sit in both views — the two totals differ, and that is correct', () => {
    const engagements = engagementsMensuelsLisses(commitments, NO_COMMITMENT_PAYMENTS, REF);
    expect(aPayerCeMois(obligations).toNumber()).not.toBeCloseTo(
      effortLisse(charges, engagements).toNumber(),
      2,
    );
  });

  it('ticking an instalment removes it from what is left to pay, not from the list', () => {
    const ticked = obligationsDuMois({
      charges,
      chargePayments: NO_CHARGE_PAYMENTS,
      commitments,
      paidKeysByCommitment: new Map([['spf', new Set(['2026-7'])]]),
      ref: REF,
    });
    expect(ticked).toHaveLength(3);
    expect(aPayerCeMois(ticked).toNumber()).toBeCloseTo(1981.21, 2);
    expect(resteAPayerCeMois(ticked).toNumber()).toBeCloseTo(1761.21, 2);
  });
});

describe('the double count, reproduced and named', () => {
  // The BROKEN state documented on 2026-07-29: « Impôt 220 € » in both tables.
  const charges = [
    charge({ id: 'loyer', label: 'Loyer', amount: new Decimal(1584.21), paymentDay: 1 }),
    charge({ id: 'impot', label: 'Impôt', amount: new Decimal(220), paymentDay: 15 }),
  ];
  const commitments = [
    commitment({ id: 'spf', label: 'SPF Impôts', installmentAmount: 220, totalAmount: 2420 }),
  ];

  it('the heuristic sees the pair', () => {
    const doublons = detecterDoublonsProbables({ charges, commitments, ref: REF });
    expect(doublons).toHaveLength(1);
    expect(doublons[0]?.chargeId).toBe('impot');
    expect(doublons[0]?.commitmentId).toBe('spf');
    // Same amount, same payment day, and « Impôt » folds onto « SPF Impôts ».
    expect(doublons[0]?.signaux).toEqual(['montant', 'jour', 'libelle']);
  });

  it('one matching signal is not enough — two unrelated 100 € bills stay silent', () => {
    expect(
      detecterDoublonsProbables({
        charges: [charge({ id: 'a', label: 'Netflix', amount: new Decimal(100), paymentDay: 3 })],
        commitments: [
          commitment({ id: 'b', label: 'Crédit voiture', installmentAmount: 100, paymentDay: 21 }),
        ],
        ref: REF,
      }),
    ).toEqual([]);
  });

  it('WARNS WITHOUT CALCULATING — neither total moves by one cent', () => {
    const engagements = engagementsMensuelsLisses(commitments, NO_COMMITMENT_PAYMENTS, REF);
    const obligations = obligationsDuMois({
      charges,
      chargePayments: NO_CHARGE_PAYMENTS,
      commitments,
      paidKeysByCommitment: NO_COMMITMENT_PAYMENTS,
      ref: REF,
    });

    // The pair IS flagged...
    expect(detecterDoublonsProbables({ charges, commitments, ref: REF })).toHaveLength(1);
    // ...and the arithmetic is untouched: 220 € still counted twice, on purpose.
    // The fix is structural (convert the charge, or deactivate it), never a
    // silent subtraction driven by a resemblance.
    expect(aPayerCeMois(obligations).toNumber()).toBeCloseTo(2024.21, 2);
    expect(effortLisse(charges, engagements).toNumber()).toBeCloseTo(2024.21, 2);
  });

  it('converting the charge away is what fixes the figure — 2 024,21 → 1 804,21', () => {
    // Exactly what the conversion flow does: the charge is deactivated, the
    // commitment becomes the single source of the 220 €.
    const converted = charges.map((c) => (c.id === 'impot' ? { ...c, isActive: false } : c));
    const engagements = engagementsMensuelsLisses(commitments, NO_COMMITMENT_PAYMENTS, REF);
    expect(effortLisse(converted, engagements).toNumber()).toBeCloseTo(1804.21, 2);
  });
});

describe('non-contamination — a remembered figure reaches no cockpit total', () => {
  const charges = [charge({ id: 'loyer', amount: new Decimal(1584.21) })];

  /** Alpha Credit: 250 €/month, 35 instalments left. */
  const alphaCredit = (totalAmount: number): NamedCommitment =>
    commitment({
      id: 'alpha',
      label: 'Alpha Credit',
      installmentAmount: 250,
      installmentsTotal: 35,
      totalAmount,
    });

  it('varying `totalAmount` (14 500 remembered vs 8 750 derived) moves nothing', () => {
    const derived = [alphaCredit(8750)];
    const remembered = [alphaCredit(14500)];

    const effortOf = (cs: readonly NamedCommitment[]) =>
      effortLisse(charges, engagementsMensuelsLisses(cs, NO_COMMITMENT_PAYMENTS, REF)).toNumber();
    const cashOf = (cs: readonly NamedCommitment[]) =>
      aPayerCeMois(
        obligationsDuMois({
          charges,
          chargePayments: NO_CHARGE_PAYMENTS,
          commitments: cs,
          paidKeysByCommitment: NO_COMMITMENT_PAYMENTS,
          ref: REF,
        }),
      ).toNumber();

    expect(effortOf(remembered)).toBe(effortOf(derived));
    expect(cashOf(remembered)).toBe(cashOf(derived));
    // And the value they both take is the one the SCHEDULE implies.
    expect(effortOf(derived)).toBeCloseTo(1834.21, 2);
    expect(cashOf(derived)).toBeCloseTo(1834.21, 2);
  });

  it('the test is not vacuous — the instalment IS what drives both figures', () => {
    const heavier = [alphaCredit(8750)].map((c) => ({ ...c, installmentAmount: 300 }));
    expect(
      effortLisse(charges, engagementsMensuelsLisses(heavier, NO_COMMITMENT_PAYMENTS, REF)).toNumber(),
    ).toBeCloseTo(1884.21, 2);
  });
});

describe('a ticked charge and a ticked instalment read the same way', () => {
  it('both carry `isPaid` from their own ledger', () => {
    const obligations = obligationsDuMois({
      charges: [charge({ id: 'loyer', paymentDay: 1 })],
      chargePayments: new Map([[paymentKey('loyer', 2026, 7), true]]),
      commitments: [commitment({ id: 'alpha', label: 'Alpha Credit' })],
      paidKeysByCommitment: new Map([['alpha', new Set(['2026-7'])]]),
      ref: REF,
    });
    expect(obligations.every((o) => o.isPaid)).toBe(true);
    expect(resteAPayerCeMois(obligations).toNumber()).toBe(0);
  });

  it('an instalment carries its position in the schedule, a charge does not', () => {
    const obligations = obligationsDuMois({
      charges: [charge({ id: 'loyer' })],
      chargePayments: NO_CHARGE_PAYMENTS,
      commitments: [commitment({ id: 'alpha', startYear: 2026, startMonth: 3 })],
      paidKeysByCommitment: NO_COMMITMENT_PAYMENTS,
      ref: REF,
    });
    const instalment = obligations.find((o) => o.source === 'commitment');
    // Anchored March, monthly: July is the 5th.
    expect(instalment?.installmentIndex).toBe(5);
    expect(instalment?.installmentsTotal).toBe(35);
    expect(obligations.find((o) => o.source === 'charge')?.installmentIndex).toBeNull();
  });
});
