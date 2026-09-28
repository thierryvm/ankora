import { describe, it, expect } from 'vitest';

import { money, type Charge } from '@/lib/domain/types';
import {
  computeMonthlyTransferPlan,
  projectedEpargneBalance,
  provisionPartOfMonth,
  virementsRestants,
} from '@/lib/domain/transfer';

// THI-192: `paymentMonths` + `paymentDay` were added to `Charge`. For these
// transfer tests (PR-D1 era) the schedule precision is irrelevant — the
// transfer math reads only `frequency`, `dueMonth`, `amount`, `paidFrom` and
// `isActive`. Defaults below mirror the DB `payment_months default array[1..12]`
// + `payment_day default 1`.
const DEFAULT_PAYMENT_MONTHS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const monthlyCharge = (over: Partial<Charge> = {}): Charge => ({
  id: 'm1',
  label: 'Loyer',
  amount: money(900),
  frequency: 'monthly',
  dueMonth: 1,
  paymentMonths: DEFAULT_PAYMENT_MONTHS,
  paymentDay: 1,
  categoryId: null,
  isActive: true,
  paidFrom: 'principal',
  ...over,
});

const annualSmoothed = (over: Partial<Charge> = {}): Charge => ({
  id: 'a1',
  label: 'Taxe voiture',
  amount: money(1200),
  frequency: 'annual',
  dueMonth: 6,
  paymentMonths: [6],
  paymentDay: 1,
  categoryId: null,
  isActive: true,
  paidFrom: 'epargne',
  ...over,
});

const quarterlySmoothed = (over: Partial<Charge> = {}): Charge => ({
  id: 'q1',
  label: 'Eau',
  amount: money(90),
  frequency: 'quarterly',
  dueMonth: 2,
  paymentMonths: [2, 5, 8, 11],
  paymentDay: 1,
  categoryId: null,
  isActive: true,
  paidFrom: 'epargne',
  ...over,
});

describe('computeMonthlyTransferPlan — lightest case', () => {
  it('returns zero everywhere when no charges and no salary', () => {
    const plan = computeMonthlyTransferPlan({
      charges: [],
      month: 1,
      monthlyIncome: money(0),
      vieCouranteMonthlyTransfer: money(0),
      commitmentsDue: money(0),
    });

    expect(plan.epargneProvisionTarget.toNumber()).toBe(0);
    expect(plan.epargneBillsDue.toNumber()).toBe(0);
    expect(plan.epargneTransferNet.toNumber()).toBe(0);
    expect(plan.principalBillsDue.toNumber()).toBe(0);
    expect(plan.netPrincipalAfterPlan.toNumber()).toBe(0);
  });
});

describe('computeMonthlyTransferPlan — monthly bills paid from Principal', () => {
  it('hits Principal every month; Épargne untouched', () => {
    const plan = computeMonthlyTransferPlan({
      charges: [monthlyCharge()],
      month: 5,
      monthlyIncome: money(2500),
      vieCouranteMonthlyTransfer: money(500),
      commitmentsDue: money(0),
    });

    expect(plan.principalBillsDue.toNumber()).toBe(900);
    expect(plan.epargneTransferNet.toNumber()).toBe(0);
    expect(plan.netPrincipalAfterPlan.toNumber()).toBe(2500 - 500 - 900);
  });
});

describe('computeMonthlyTransferPlan — "Virement Intelligent"', () => {
  it('nets provision against bills due in the same month', () => {
    // IronBudget reference example: provision 59€, bill 53€ this month → net 6€.
    const dashlane: Charge = {
      id: 'dashlane',
      label: 'Dashlane',
      amount: money(53),
      frequency: 'annual',
      dueMonth: 4,
      paymentMonths: [4],
      paymentDay: 1,
      categoryId: null,
      isActive: true,
      paidFrom: 'epargne',
    };
    // Provision total ≈ 53 / 12 ≈ 4.4166… so we craft another charge to bring it to 59.
    // Use an annual charge of (59 - 53/12)*12 = 655 to push the monthly provision to 59.
    const extra: Charge = {
      id: 'extra',
      label: 'Charge composée',
      amount: money(655),
      frequency: 'annual',
      dueMonth: 10,
      paymentMonths: [10],
      paymentDay: 1,
      categoryId: null,
      isActive: true,
      paidFrom: 'epargne',
    };

    const plan = computeMonthlyTransferPlan({
      charges: [dashlane, extra],
      month: 4,
      monthlyIncome: money(2500),
      vieCouranteMonthlyTransfer: money(500),
      commitmentsDue: money(0),
    });

    expect(plan.epargneProvisionTarget.toNumber()).toBe(59);
    expect(plan.epargneBillsDue.toNumber()).toBe(53);
    expect(plan.epargneTransferNet.toNumber()).toBe(6);
  });
});

describe('computeMonthlyTransferPlan — heavy-bill month', () => {
  it('returns negative epargneTransferNet when bills exceed provisioning', () => {
    const plan = computeMonthlyTransferPlan({
      charges: [annualSmoothed()],
      month: 6,
      monthlyIncome: money(2500),
      vieCouranteMonthlyTransfer: money(500),
      commitmentsDue: money(0),
    });

    expect(plan.epargneProvisionTarget.toNumber()).toBe(100);
    expect(plan.epargneBillsDue.toNumber()).toBe(1200);
    expect(plan.epargneTransferNet.toNumber()).toBe(-1100);
    // Principal recovers 1100 from Épargne and pays the 1200 bill itself:
    // a paid bill always debits the main account (ADR-045 D22).
    expect(plan.netPrincipalAfterPlan.toNumber()).toBe(2500 - 500 - -1100 - 1200);
    expect(plan.epargneProvisionPart.toNumber()).toBe(0);
  });
});

describe('computeMonthlyTransferPlan — periodic charge flagged principal', () => {
  it('lands bill on Principal in its due month and skips Épargne', () => {
    const plan = computeMonthlyTransferPlan({
      charges: [annualSmoothed({ paidFrom: 'principal' })],
      month: 6,
      monthlyIncome: money(2500),
      vieCouranteMonthlyTransfer: money(500),
      commitmentsDue: money(0),
    });

    expect(plan.epargneProvisionTarget.toNumber()).toBe(0);
    expect(plan.epargneBillsDue.toNumber()).toBe(0);
    expect(plan.epargneTransferNet.toNumber()).toBe(0);
    expect(plan.principalBillsDue.toNumber()).toBe(1200);
  });

  it('skips the bill in other months', () => {
    const plan = computeMonthlyTransferPlan({
      charges: [annualSmoothed({ paidFrom: 'principal' })],
      month: 5,
      monthlyIncome: money(2500),
      vieCouranteMonthlyTransfer: money(500),
      commitmentsDue: money(0),
    });
    expect(plan.principalBillsDue.toNumber()).toBe(0);
  });
});

describe('computeMonthlyTransferPlan — full mix', () => {
  it('handles monthly + smoothed quarterly + smoothed annual together', () => {
    const plan = computeMonthlyTransferPlan({
      charges: [monthlyCharge(), quarterlySmoothed(), annualSmoothed()],
      month: 2,
      monthlyIncome: money(2500),
      vieCouranteMonthlyTransfer: money(500),
      commitmentsDue: money(0),
    });

    // Monthly provision of smoothed set = 90/3 + 1200/12 = 30 + 100 = 130
    expect(plan.epargneProvisionTarget.toNumber()).toBe(130);
    // Smoothed bills due in month 2 = water 90 (quarterly, dueMonth=2)
    expect(plan.epargneBillsDue.toNumber()).toBe(90);
    // Net transfer to Épargne = 130 - 90 = 40
    expect(plan.epargneTransferNet.toNumber()).toBe(40);
    // Principal bills this month = rent 900 only
    expect(plan.principalBillsDue.toNumber()).toBe(900);
    // Principal remainder = 2500 - 500 - 40 - 900 - 90 = 970: the 90 water
    // bill leaves the main account (ADR-045 D22), only the net 40 is transferred.
    expect(plan.netPrincipalAfterPlan.toNumber()).toBe(970);
    expect(plan.epargneProvisionPart.toNumber()).toBe(40);
  });
});

describe('computeMonthlyTransferPlan — input validation', () => {
  it('rejects month < 1 or > 12', () => {
    expect(() =>
      computeMonthlyTransferPlan({
        charges: [],
        month: 0,
        monthlyIncome: money(0),
        vieCouranteMonthlyTransfer: money(0),
        commitmentsDue: money(0),
      }),
    ).toThrow(RangeError);
    expect(() =>
      computeMonthlyTransferPlan({
        charges: [],
        month: 13,
        monthlyIncome: money(0),
        vieCouranteMonthlyTransfer: money(0),
        commitmentsDue: money(0),
      }),
    ).toThrow(RangeError);
  });

  it('rejects negative salary', () => {
    expect(() =>
      computeMonthlyTransferPlan({
        charges: [],
        month: 1,
        monthlyIncome: money(-1),
        vieCouranteMonthlyTransfer: money(0),
        commitmentsDue: money(0),
      }),
    ).toThrow(RangeError);
  });

  it('rejects negative vie courante transfer', () => {
    expect(() =>
      computeMonthlyTransferPlan({
        charges: [],
        month: 1,
        monthlyIncome: money(0),
        vieCouranteMonthlyTransfer: money(-1),
        commitmentsDue: money(0),
      }),
    ).toThrow(RangeError);
  });
});

describe('computeMonthlyTransferPlan — inactive charges', () => {
  it('skips inactive charges entirely', () => {
    const plan = computeMonthlyTransferPlan({
      charges: [monthlyCharge({ isActive: false }), annualSmoothed({ isActive: false })],
      month: 6,
      monthlyIncome: money(2500),
      vieCouranteMonthlyTransfer: money(500),
      commitmentsDue: money(0),
    });
    expect(plan.epargneProvisionTarget.toNumber()).toBe(0);
    expect(plan.epargneBillsDue.toNumber()).toBe(0);
    expect(plan.principalBillsDue.toNumber()).toBe(0);
  });
});

/**
 * « RESTANT PRINCIPAL » STOPS IGNORING THE COMMITMENTS.
 *
 * The cockpit carried two "remainings" with two perimeters and no label saying
 * so: « Budget du mois » deducted the smoothed commitment burden while
 * « Restant Principal » (`netPrincipalAfterPlan`) did not deduct the instalment
 * at all. One screen, two answers to « ce qui me reste ».
 *
 * One rule, one word: an instalment is CASH leaving Principal this month, like
 * a bill, so it belongs to this figure — and the block is renamed « Après tes
 * sorties de <mois> » so it can never be read as the budget view.
 */
describe('computeMonthlyTransferPlan — commitment instalments are cash', () => {
  it('subtracts the month’s instalment from what is left on Principal', () => {
    const withoutCommitment = computeMonthlyTransferPlan({
      charges: [monthlyCharge()],
      month: 5,
      monthlyIncome: money(2500),
      vieCouranteMonthlyTransfer: money(500),
      commitmentsDue: money(0),
    });
    const withCommitment = computeMonthlyTransferPlan({
      charges: [monthlyCharge()],
      month: 5,
      monthlyIncome: money(2500),
      vieCouranteMonthlyTransfer: money(500),
      commitmentsDue: money(250),
    });

    expect(withCommitment.commitmentsDue.toNumber()).toBe(250);
    expect(
      withoutCommitment.netPrincipalAfterPlan
        .minus(withCommitment.netPrincipalAfterPlan)
        .toNumber(),
    ).toBe(250);
  });

  it('leaves the Épargne movements untouched — an instalment is not a provision', () => {
    const plan = computeMonthlyTransferPlan({
      charges: [annualSmoothed()],
      month: 1,
      monthlyIncome: money(2500),
      vieCouranteMonthlyTransfer: money(500),
      commitmentsDue: money(250),
    });
    expect(plan.epargneProvisionTarget.toNumber()).toBe(100);
    expect(plan.epargneTransferNet.toNumber()).toBe(100);
  });

  it('refuses a negative instalment total rather than silently adding cash', () => {
    expect(() =>
      computeMonthlyTransferPlan({
        charges: [],
        month: 1,
        monthlyIncome: money(1000),
        vieCouranteMonthlyTransfer: money(0),
        commitmentsDue: money(-1),
      }),
    ).toThrow(RangeError);
  });
});

describe('projectedEpargneBalance', () => {
  it('adds net transfer to current balance', () => {
    const plan = computeMonthlyTransferPlan({
      charges: [annualSmoothed()],
      month: 1,
      monthlyIncome: money(2500),
      vieCouranteMonthlyTransfer: money(500),
      commitmentsDue: money(0),
    });
    expect(projectedEpargneBalance(money(300), plan).toNumber()).toBe(400);
  });

  it('handles negative net transfer (withdrawal from Épargne)', () => {
    const plan = computeMonthlyTransferPlan({
      charges: [annualSmoothed()],
      month: 6,
      monthlyIncome: money(2500),
      vieCouranteMonthlyTransfer: money(500),
      commitmentsDue: money(0),
    });
    expect(projectedEpargneBalance(money(1500), plan).toNumber()).toBe(400);
  });
});

/**
 * Tour 55 — one rule for the provisions share of a transfer. A smoothed bill
 * paid this month leaves the MAIN account (ADR-045 D22), so the transfer to the
 * provisions only carries the net: the line « 70 à mettre de côté − 55 de
 * factures = 15 » and the split of a 505 transfer must both read 15, never 70.
 */
describe('provisionPartOfMonth — the net, never the target', () => {
  const smoothed = (amount: number, frequency: Charge['frequency'], dueMonth: number): Charge =>
    annualSmoothed({ id: `s${amount}`, amount: money(amount), frequency, dueMonth });
  // An annual 60 (5 a month, due in January) and a quarterly 165 (55 a month).
  const charges = [smoothed(60, 'annual', 1), smoothed(165, 'quarterly', 3)];

  it('is the monthly target minus the smoothed bills due, as the line says', () => {
    const plan = computeMonthlyTransferPlan({
      charges,
      month: 1,
      monthlyIncome: money(2505),
      vieCouranteMonthlyTransfer: money(505),
      commitmentsDue: money(0),
    });
    // target 5 + 55 = 60 ; due in month 1: the 60 annual → net 0
    expect(plan.epargneProvisionTarget.toNumber()).toBe(60);
    expect(plan.epargneBillsDue.toNumber()).toBe(60);
    expect(plan.epargneProvisionPart.toNumber()).toBe(0);
    expect(provisionPartOfMonth(charges, 1).toNumber()).toBe(0);
  });

  it('is what the server and the sheet split a transfer with', () => {
    const plan = computeMonthlyTransferPlan({
      charges: [smoothed(840, 'annual', 9), smoothed(15, 'monthly', 1)],
      month: 2,
      monthlyIncome: money(2505),
      vieCouranteMonthlyTransfer: money(505),
      commitmentsDue: money(0),
    });
    // target 70 + 15 = 85 ; the monthly 15 is due in month 2 → net 70
    expect(plan.epargneProvisionPart.toNumber()).toBe(70);
    expect(
      provisionPartOfMonth([smoothed(840, 'annual', 9), smoothed(15, 'monthly', 1)], 2).toNumber(),
    ).toBe(70);
  });

  it('« Après tes sorties » deducts the smoothed bill that leaves the main account', () => {
    const plan = computeMonthlyTransferPlan({
      charges: [smoothed(840, 'annual', 9), smoothed(15, 'monthly', 1)],
      month: 2,
      monthlyIncome: money(2505),
      vieCouranteMonthlyTransfer: money(505),
      commitmentsDue: money(0),
    });
    // 2505 − 505 − 70 (net transfer) − 15 (bill paid from the main account)
    expect(plan.netPrincipalAfterPlan.toNumber()).toBe(1915);
  });
});

describe('virementsRestants — what is still to do, not what was planned', () => {
  it('adds the lines not done yet, in absolute value', () => {
    expect(
      virementsRestants([
        { amount: money(505), done: false },
        { amount: money(-70), done: false },
      ]).toNumber(),
    ).toBe(575);
  });

  it('is zero once every line is done', () => {
    expect(
      virementsRestants([
        { amount: money(505), done: true },
        { amount: money(70), done: true },
      ]).toNumber(),
    ).toBe(0);
  });

  it('only counts the lines left', () => {
    expect(
      virementsRestants([
        { amount: money(505), done: true },
        { amount: money(70), done: false },
      ]).toNumber(),
    ).toBe(70);
  });
});
