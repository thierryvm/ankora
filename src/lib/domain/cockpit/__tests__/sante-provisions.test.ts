import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

import {
  calculerEpargneRequiseParCharge,
  calculerSanteProvisions,
  RATTRAPAGE_MONTHS,
} from '@/lib/domain/cockpit/sante-provisions';
import { paymentKey, type CockpitCharge, type ReferencePeriod } from '@/lib/domain/cockpit/types';

const charge = (over: Partial<CockpitCharge>): CockpitCharge => ({
  id: over.id ?? 'c-' + Math.random().toString(36).slice(2),
  label: over.label ?? 'Test',
  amount: over.amount ?? new Decimal(0),
  frequency: over.frequency ?? 'annual',
  paymentMonths: over.paymentMonths ?? [3],
  paymentDay: over.paymentDay ?? 1,
  isActive: over.isActive ?? true,
});

const ref = (year: number, month: number): ReferencePeriod => ({ year, month });
const noPayments = new Map<string, boolean>();

const RATTRAPAGE_DIVISOR = RATTRAPAGE_MONTHS;

describe('calculerEpargneRequiseParCharge — annual', () => {
  it('returns 0 for monthly charges (no provisioning needed)', () => {
    const c = charge({ amount: new Decimal(900), frequency: 'monthly' });
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 5),
      payments: noPayments,
    });
    expect(out.toNumber()).toBe(0);
  });

  it('returns 0 for inactive charges', () => {
    const c = charge({ amount: new Decimal(1200), paymentMonths: [3], isActive: false });
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 5),
      payments: noPayments,
    });
    expect(out.toNumber()).toBe(0);
  });

  it('annual charge — 1 month before due → 11/12 of amount required', () => {
    const c = charge({ amount: new Decimal(1200), paymentMonths: [3] });
    // ref month 2, due month 3, monthsLeft = 1, safeMonthsLeft = 1
    // requise = 1200 - 1200/12 × 1 = 1200 - 100 = 1100
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 2),
      payments: noPayments,
    });
    expect(out.toNumber()).toBe(1100);
  });

  it('annual charge — 11 months before due (just settled) → 1/12 of amount required', () => {
    const c = charge({ amount: new Decimal(1200), paymentMonths: [3] });
    // ref month 4, due month 3 next year (wrap), monthsLeft = 11, safeMonthsLeft = 11
    // requise = 1200 - 100 × 11 = 100
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 4),
      payments: noPayments,
    });
    expect(out.toNumber()).toBe(100);
  });

  it('annual charge — due this month, NOT paid → full amount required', () => {
    const c = charge({ amount: new Decimal(1200), paymentMonths: [3] });
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 3),
      payments: noPayments,
    });
    expect(out.toNumber()).toBe(1200);
  });

  it('annual charge — due this month, ALREADY paid → 0 required (cycle reset)', () => {
    const c = charge({ id: 'taxe', amount: new Decimal(1200), paymentMonths: [3] });
    const payments = new Map<string, boolean>([[paymentKey('taxe', 2026, 3), true]]);
    // After payment, nextMois rolls to next year's March → monthsLeft = 12
    // requise = 1200 - 100 × 12 = 0
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 3),
      payments,
    });
    expect(out.toNumber()).toBe(0);
  });
});

describe('calculerEpargneRequiseParCharge — quarterly', () => {
  it('quarterly — exactly between two due months → mid-cycle requirement', () => {
    const c = charge({
      amount: new Decimal(45),
      frequency: 'quarterly',
      paymentMonths: [1, 4, 7, 10],
    });
    // ref month 5, next due 7 (in 2 months), cycleMonths = 3, safeMonthsLeft = 2
    // requise = 45 - 15 × 2 = 15
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 5),
      payments: noPayments,
    });
    expect(out.toNumber()).toBe(15);
  });

  it('quarterly — just after a due month → almost full cycle to save', () => {
    const c = charge({
      amount: new Decimal(45),
      frequency: 'quarterly',
      paymentMonths: [1, 4, 7, 10],
    });
    // ref month 2, next due 4 (in 2 months), safeMonthsLeft = 2
    // requise = 45 - 15 × 2 = 15
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 2),
      payments: noPayments,
    });
    expect(out.toNumber()).toBe(15);
  });

  it('quarterly — due this month and paid → 1/3 of cycle elapsed → ~0', () => {
    const c = charge({
      id: 'water',
      amount: new Decimal(45),
      frequency: 'quarterly',
      paymentMonths: [1, 4, 7, 10],
    });
    const payments = new Map<string, boolean>([[paymentKey('water', 2026, 4), true]]);
    // After paying April, nextMois = July → monthsLeft = 3, safeMonthsLeft = 3
    // requise = 45 - 15 × 3 = 0
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 4),
      payments,
    });
    expect(out.toNumber()).toBe(0);
  });

  it('quarterly — wrap-around December → January', () => {
    const c = charge({
      amount: new Decimal(45),
      frequency: 'quarterly',
      paymentMonths: [1, 4, 7, 10],
    });
    // ref month 12, next due Jan (wraps), monthsLeft = 1, safeMonthsLeft = 1
    // requise = 45 - 15 × 1 = 30
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 12),
      payments: noPayments,
    });
    expect(out.toNumber()).toBe(30);
  });
});

describe('calculerEpargneRequiseParCharge — semiannual (Ankora extension)', () => {
  it('semiannual — 3 months before due → mid-cycle requirement', () => {
    const c = charge({
      amount: new Decimal(600),
      frequency: 'semiannual',
      paymentMonths: [3, 9],
    });
    // ref month 6, next due 9, monthsLeft = 3, cycleMonths = 6, safeMonthsLeft = 3
    // requise = 600 - 100 × 3 = 300
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 6),
      payments: noPayments,
    });
    expect(out.toNumber()).toBe(300);
  });

  it('semiannual — wrap-around December → March', () => {
    const c = charge({
      amount: new Decimal(600),
      frequency: 'semiannual',
      paymentMonths: [3, 9],
    });
    // ref 12, next due 3 (wrap), monthsLeft = 3, safeMonthsLeft = 3
    // requise = 600 - 100 × 3 = 300
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 12),
      payments: noPayments,
    });
    expect(out.toNumber()).toBe(300);
  });

  it('semiannual — due this month and paid → cycle reset to 6 months saving', () => {
    const c = charge({
      id: 'sem',
      amount: new Decimal(600),
      frequency: 'semiannual',
      paymentMonths: [3, 9],
    });
    const payments = new Map<string, boolean>([[paymentKey('sem', 2026, 3), true]]);
    // After March payment, nextMois = Sept → monthsLeft = 6, safeMonthsLeft = 6
    // requise = 600 - 100 × 6 = 0
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 3),
      payments,
    });
    expect(out.toNumber()).toBe(0);
  });
});

describe('calculerEpargneRequiseParCharge — wrap-around scenarios', () => {
  it('annual due in January, ref November → 2 months left', () => {
    const c = charge({ amount: new Decimal(1200), paymentMonths: [1] });
    // ref 11, next due 1 (wrap), monthsLeft = 2
    // requise = 1200 - 100 × 2 = 1000
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 11),
      payments: noPayments,
    });
    expect(out.toNumber()).toBe(1000);
  });

  it('annual due in January, ref December → 1 month left', () => {
    const c = charge({ amount: new Decimal(1200), paymentMonths: [1] });
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 12),
      payments: noPayments,
    });
    expect(out.toNumber()).toBe(1100);
  });

  it('annual due in December, ref January → 11 months left', () => {
    const c = charge({ amount: new Decimal(1200), paymentMonths: [12] });
    // ref 1, next due 12, monthsLeft = 11, safeMonthsLeft = 11
    // requise = 1200 - 100 × 11 = 100
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 1),
      payments: noPayments,
    });
    expect(out.toNumber()).toBe(100);
  });

  it('paymentMonths sorted ascending regardless of input order', () => {
    const c = charge({
      amount: new Decimal(45),
      frequency: 'quarterly',
      paymentMonths: [10, 1, 7, 4], // unsorted
    });
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 5),
      payments: noPayments,
    });
    // Same as the sorted [1,4,7,10] case: next = 7, monthsLeft = 2 → requise = 15
    expect(out.toNumber()).toBe(15);
  });

  it('handles empty paymentMonths defensively (returns 0)', () => {
    const c = charge({
      amount: new Decimal(1200),
      paymentMonths: [], // pathological — shouldn't happen but the algo must not crash
    });
    const out = calculerEpargneRequiseParCharge({
      charge: c,
      ref: ref(2026, 5),
      payments: noPayments,
    });
    expect(out.toNumber()).toBe(0);
  });
});

describe('calculerSanteProvisions — aggregation', () => {
  it('returns "a_jour" when there are no periodic charges', () => {
    const out = calculerSanteProvisions({
      charges: [charge({ amount: new Decimal(900), frequency: 'monthly' })],
      payments: noPayments,
      soldeEpargneActuel: new Decimal(0),
      ref: ref(2026, 5),
    });
    expect(out.statut).toBe('a_jour');
    expect(out.totalEpargneTheorique.toNumber()).toBe(0);
    expect(out.deficitEpargne.toNumber()).toBe(0);
    expect(out.rattrapageMensuel.toNumber()).toBe(0);
  });

  it('returns "a_jour" when balance covers the théorique exactly', () => {
    const out = calculerSanteProvisions({
      charges: [charge({ amount: new Decimal(1200), paymentMonths: [3] })],
      payments: noPayments,
      soldeEpargneActuel: new Decimal(1100), // 1200 - 100 × 1 (ref = month 2)
      ref: ref(2026, 2),
    });
    expect(out.statut).toBe('a_jour');
    expect(out.deficitEpargne.toNumber()).toBe(0);
  });

  it('returns "a_jour" when balance is over-provisioned (negative deficit)', () => {
    const out = calculerSanteProvisions({
      charges: [charge({ amount: new Decimal(1200), paymentMonths: [3] })],
      payments: noPayments,
      soldeEpargneActuel: new Decimal(5000),
      ref: ref(2026, 2),
    });
    expect(out.statut).toBe('a_jour');
    expect(out.deficitEpargne.lt(0)).toBe(true);
    expect(out.rattrapageMensuel.toNumber()).toBe(0);
  });

  it('returns "deficit" with rattrapage = deficit / 3', () => {
    const out = calculerSanteProvisions({
      charges: [charge({ amount: new Decimal(1200), paymentMonths: [3] })],
      payments: noPayments,
      soldeEpargneActuel: new Decimal(0),
      ref: ref(2026, 2),
    });
    // Théorique = 1100, solde = 0, déficit = 1100, rattrapage = 1100/3
    expect(out.statut).toBe('deficit');
    expect(out.deficitEpargne.toNumber()).toBe(1100);
    expect(out.rattrapageMensuel.toFixed(2)).toBe(
      new Decimal(1100).dividedBy(RATTRAPAGE_DIVISOR).toFixed(2),
    );
  });

  it('exposes per-charge breakdown', () => {
    const out = calculerSanteProvisions({
      charges: [
        charge({ id: 'a', amount: new Decimal(120), paymentMonths: [3] }),
        charge({ id: 'b', amount: new Decimal(300), paymentMonths: [6] }),
      ],
      payments: noPayments,
      soldeEpargneActuel: new Decimal(50),
      ref: ref(2026, 2),
    });
    expect(out.detailParCharge).toHaveLength(2);
    expect(out.detailParCharge.find((d) => d.chargeId === 'a')).toBeDefined();
    expect(out.detailParCharge.find((d) => d.chargeId === 'b')).toBeDefined();
  });

  it("reproduces @thierry's real fixture (5 periodic charges)", () => {
    const charges = [
      charge({ id: 'dashlane', amount: new Decimal(53), paymentMonths: [4] }),
      charge({
        id: 'swde',
        amount: new Decimal(45),
        frequency: 'quarterly',
        paymentMonths: [1, 4, 7, 10],
      }),
      charge({ id: 'taxe-voiture', amount: new Decimal(300), paymentMonths: [6] }),
      charge({ id: 'taxe-poubelle', amount: new Decimal(120), paymentMonths: [3] }),
      charge({ id: 'taxe-egout', amount: new Decimal(55), paymentMonths: [3] }),
    ];
    const out = calculerSanteProvisions({
      charges,
      payments: noPayments,
      soldeEpargneActuel: new Decimal(200),
      ref: ref(2026, 5),
    });
    // Just assert structure — exact values are tested per-charge above.
    expect(out.detailParCharge).toHaveLength(5);
    expect(out.totalEpargneTheorique.gt(0)).toBe(true);
  });

  it('skips inactive charges entirely', () => {
    const out = calculerSanteProvisions({
      charges: [charge({ amount: new Decimal(1200), paymentMonths: [3], isActive: false })],
      payments: noPayments,
      soldeEpargneActuel: new Decimal(0),
      ref: ref(2026, 5),
    });
    expect(out.detailParCharge).toHaveLength(0);
    expect(out.statut).toBe('a_jour');
  });

  it('uses payments to advance the cycle for paid bills', () => {
    const c = charge({ id: 'taxe', amount: new Decimal(1200), paymentMonths: [3] });
    const paymentsMap = new Map<string, boolean>([[paymentKey('taxe', 2026, 3), true]]);
    const out = calculerSanteProvisions({
      charges: [c],
      payments: paymentsMap,
      soldeEpargneActuel: new Decimal(0),
      ref: ref(2026, 3),
    });
    // After payment, requise = 0 → solde 0 covers it → a_jour
    expect(out.totalEpargneTheorique.toNumber()).toBe(0);
    expect(out.statut).toBe('a_jour');
  });

  it('soldeEpargneActuel is echoed unchanged in the output', () => {
    const out = calculerSanteProvisions({
      charges: [],
      payments: noPayments,
      soldeEpargneActuel: new Decimal(123.45),
      ref: ref(2026, 5),
    });
    expect(out.soldeEpargneActuel.toNumber()).toBe(123.45);
  });
});

describe('calculerSanteProvisions — edge cases', () => {
  it('large deficit produces large rattrapage (no cap at the domain layer)', () => {
    const out = calculerSanteProvisions({
      charges: [charge({ amount: new Decimal(12_000), paymentMonths: [3] })], // 1000/mo
      payments: noPayments,
      soldeEpargneActuel: new Decimal(0),
      ref: ref(2026, 4), // 11 months from next March
    });
    // Théorique = 12000 - 1000 × 11 = 1000 → deficit = 1000 → rattrapage = 333.33
    expect(out.deficitEpargne.toNumber()).toBe(1000);
    expect(out.rattrapageMensuel.toFixed(2)).toBe('333.33');
  });

  it('rounds rattrapage with Decimal precision (no float drift)', () => {
    const out = calculerSanteProvisions({
      charges: [charge({ amount: new Decimal(100), paymentMonths: [12] })],
      payments: noPayments,
      soldeEpargneActuel: new Decimal(0),
      ref: ref(2026, 1),
    });
    // Théorique = 100 - (100/12)×11 = 100 - 91.6666… = 8.3333…
    // Rattrapage = 8.3333…/3 = 2.7777…
    expect(out.rattrapageMensuel.toFixed(4)).toBe('2.7778');
  });

  it('mix of paid and unpaid charges in the same workspace', () => {
    const charges = [
      charge({ id: 'a', amount: new Decimal(120), paymentMonths: [3] }),
      charge({ id: 'b', amount: new Decimal(300), paymentMonths: [3] }),
    ];
    const paymentsMap = new Map<string, boolean>([[paymentKey('a', 2026, 3), true]]);
    const out = calculerSanteProvisions({
      charges,
      payments: paymentsMap,
      soldeEpargneActuel: new Decimal(0),
      ref: ref(2026, 3),
    });
    // a paid → requise = 0 ; b not paid → requise = 300
    expect(out.totalEpargneTheorique.toNumber()).toBe(300);
  });

  it('handles a workspace with zero charges (empty cockpit)', () => {
    const out = calculerSanteProvisions({
      charges: [],
      payments: noPayments,
      soldeEpargneActuel: new Decimal(0),
      ref: ref(2026, 5),
    });
    expect(out.statut).toBe('a_jour');
    expect(out.detailParCharge).toHaveLength(0);
  });
});
