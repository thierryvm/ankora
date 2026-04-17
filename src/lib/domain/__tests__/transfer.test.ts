import { describe, it, expect } from 'vitest';

import { money, type Charge } from '@/lib/domain/types';
import { computeMonthlyTransferPlan, projectedEpargneBalance } from '@/lib/domain/transfer';

const monthlyCharge = (over: Partial<Charge> = {}): Charge => ({
  id: 'm1',
  label: 'Loyer',
  amount: money(900),
  frequency: 'monthly',
  dueMonth: 1,
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
      categoryId: null,
      isActive: true,
      paidFrom: 'epargne',
    };

    const plan = computeMonthlyTransferPlan({
      charges: [dashlane, extra],
      month: 4,
      monthlyIncome: money(2500),
      vieCouranteMonthlyTransfer: money(500),
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
    });

    expect(plan.epargneProvisionTarget.toNumber()).toBe(100);
    expect(plan.epargneBillsDue.toNumber()).toBe(1200);
    expect(plan.epargneTransferNet.toNumber()).toBe(-1100);
    // Principal recovers 1100 from Épargne, pays the bill (already on Épargne side).
    expect(plan.netPrincipalAfterPlan.toNumber()).toBe(2500 - 500 - -1100);
  });
});

describe('computeMonthlyTransferPlan — periodic charge flagged principal', () => {
  it('lands bill on Principal in its due month and skips Épargne', () => {
    const plan = computeMonthlyTransferPlan({
      charges: [annualSmoothed({ paidFrom: 'principal' })],
      month: 6,
      monthlyIncome: money(2500),
      vieCouranteMonthlyTransfer: money(500),
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
    });

    // Monthly provision of smoothed set = 90/3 + 1200/12 = 30 + 100 = 130
    expect(plan.epargneProvisionTarget.toNumber()).toBe(130);
    // Smoothed bills due in month 2 = water 90 (quarterly, dueMonth=2)
    expect(plan.epargneBillsDue.toNumber()).toBe(90);
    // Net transfer to Épargne = 130 - 90 = 40
    expect(plan.epargneTransferNet.toNumber()).toBe(40);
    // Principal bills this month = rent 900 only
    expect(plan.principalBillsDue.toNumber()).toBe(900);
    // Principal remainder = 2500 - 500 - 40 - 900 = 1060
    expect(plan.netPrincipalAfterPlan.toNumber()).toBe(1060);
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
      }),
    ).toThrow(RangeError);
    expect(() =>
      computeMonthlyTransferPlan({
        charges: [],
        month: 13,
        monthlyIncome: money(0),
        vieCouranteMonthlyTransfer: money(0),
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
    });
    expect(plan.epargneProvisionTarget.toNumber()).toBe(0);
    expect(plan.epargneBillsDue.toNumber()).toBe(0);
    expect(plan.principalBillsDue.toNumber()).toBe(0);
  });
});

describe('projectedEpargneBalance', () => {
  it('adds net transfer to current balance', () => {
    const plan = computeMonthlyTransferPlan({
      charges: [annualSmoothed()],
      month: 1,
      monthlyIncome: money(2500),
      vieCouranteMonthlyTransfer: money(500),
    });
    expect(projectedEpargneBalance(money(300), plan).toNumber()).toBe(400);
  });

  it('handles negative net transfer (withdrawal from Épargne)', () => {
    const plan = computeMonthlyTransferPlan({
      charges: [annualSmoothed()],
      month: 6,
      monthlyIncome: money(2500),
      vieCouranteMonthlyTransfer: money(500),
    });
    expect(projectedEpargneBalance(money(1500), plan).toNumber()).toBe(400);
  });
});
