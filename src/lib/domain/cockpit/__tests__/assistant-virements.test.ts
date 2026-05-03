import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

import { calculerAssistantVirements } from '@/lib/domain/cockpit/assistant-virements';
import type { CockpitCharge, ReferencePeriod } from '@/lib/domain/cockpit/types';

const ZERO = new Decimal(0);

const charge = (over: Partial<CockpitCharge>): CockpitCharge => ({
  id: over.id ?? 'c-' + Math.random().toString(36).slice(2),
  label: over.label ?? 'Test',
  amount: over.amount ?? new Decimal(0),
  frequency: over.frequency ?? 'monthly',
  paymentMonths: over.paymentMonths ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  paymentDay: over.paymentDay ?? 1,
  isActive: over.isActive ?? true,
});

const ref = (year: number, month: number): ReferencePeriod => ({ year, month });

describe('calculerAssistantVirements — direction', () => {
  it('returns "aucun" when there are no periodic charges', () => {
    const out = calculerAssistantVirements({
      charges: [charge({ amount: new Decimal(900), frequency: 'monthly' })],
      ref: ref(2026, 5),
      rattrapageMensuel: ZERO,
    });
    expect(out.direction).toBe('aucun');
    expect(out.transfertRecommande.toNumber()).toBe(0);
    expect(out.transfertRecommandeAjuste.toNumber()).toBe(0);
  });

  it('returns "vers_epargne" when no periodic bill is due this month', () => {
    const out = calculerAssistantVirements({
      charges: [charge({ amount: new Decimal(1200), frequency: 'annual', paymentMonths: [3] })],
      ref: ref(2026, 5),
      rattrapageMensuel: ZERO,
    });
    expect(out.direction).toBe('vers_epargne');
    expect(out.transfertRecommandeAjuste.toNumber()).toBe(100);
  });

  it('returns "depuis_epargne" when periodic bills exceed provisions', () => {
    const out = calculerAssistantVirements({
      charges: [
        charge({ amount: new Decimal(53), frequency: 'annual', paymentMonths: [4] }), // 4.42/m
        charge({ amount: new Decimal(300), frequency: 'annual', paymentMonths: [4] }), // 25/m
      ],
      ref: ref(2026, 4), // both due
      rattrapageMensuel: ZERO,
    });
    // provision = 4.4166… + 25 = 29.4166…
    // périodiques avril = 53 + 300 = 353
    // transfert = 29.4166… - 353 ≈ -323.58
    expect(out.direction).toBe('depuis_epargne');
    expect(out.transfertRecommandeAjuste.toFixed(2)).toBe('-323.58');
  });

  it('returns "aucun" when the math lands exactly on zero', () => {
    // Annual 1200 → provision 100/mo. Due in May. In May: provision (100) - bill (1200) = -1100.
    // To make it exactly 0, we need a charge whose amount equals its monthly provision.
    // Trivially: empty list.
    const out = calculerAssistantVirements({
      charges: [],
      ref: ref(2026, 5),
      rattrapageMensuel: ZERO,
    });
    expect(out.direction).toBe('aucun');
  });

  it('treats inactive charges as if absent', () => {
    const out = calculerAssistantVirements({
      charges: [
        charge({
          amount: new Decimal(1200),
          frequency: 'annual',
          paymentMonths: [3],
          isActive: false,
        }),
      ],
      ref: ref(2026, 3),
      rattrapageMensuel: ZERO,
    });
    expect(out.provisionMensuelleTotale.toNumber()).toBe(0);
    expect(out.totalPeriodiquesMois.toNumber()).toBe(0);
    expect(out.direction).toBe('aucun');
  });
});

describe('calculerAssistantVirements — provisions', () => {
  it('reproduces @thierry real fixture (provision 59€)', () => {
    const charges = [
      charge({ id: 'dashlane', amount: new Decimal(53), frequency: 'annual', paymentMonths: [4] }),
      charge({
        id: 'swde',
        amount: new Decimal(45),
        frequency: 'quarterly',
        paymentMonths: [1, 4, 7, 10],
      }),
      charge({
        id: 'taxe-voiture',
        amount: new Decimal(300),
        frequency: 'annual',
        paymentMonths: [6],
      }),
      charge({
        id: 'taxe-poubelle',
        amount: new Decimal(120),
        frequency: 'annual',
        paymentMonths: [3],
      }),
      charge({
        id: 'taxe-egout',
        amount: new Decimal(55),
        frequency: 'annual',
        paymentMonths: [3],
      }),
    ];
    const out = calculerAssistantVirements({
      charges,
      ref: ref(2026, 5), // mai → no periodic due
      rattrapageMensuel: ZERO,
    });
    expect(out.provisionMensuelleTotale.toFixed(2)).toBe('59.00');
    expect(out.totalPeriodiquesMois.toNumber()).toBe(0);
    expect(out.transfertRecommandeAjuste.toFixed(2)).toBe('59.00');
    expect(out.direction).toBe('vers_epargne');
  });

  it('reproduces @thierry real fixture in April (Dashlane + S.W.D.E due → 6€ to transfer)', () => {
    const charges = [
      charge({ id: 'dashlane', amount: new Decimal(53), frequency: 'annual', paymentMonths: [4] }),
      charge({
        id: 'swde',
        amount: new Decimal(45),
        frequency: 'quarterly',
        paymentMonths: [1, 4, 7, 10],
      }),
      charge({
        id: 'taxe-voiture',
        amount: new Decimal(300),
        frequency: 'annual',
        paymentMonths: [6],
      }),
      charge({
        id: 'taxe-poubelle',
        amount: new Decimal(120),
        frequency: 'annual',
        paymentMonths: [3],
      }),
      charge({
        id: 'taxe-egout',
        amount: new Decimal(55),
        frequency: 'annual',
        paymentMonths: [3],
      }),
    ];
    const out = calculerAssistantVirements({
      charges,
      ref: ref(2026, 4), // April : Dashlane + S.W.D.E due
      rattrapageMensuel: ZERO,
    });
    // provision 59, bills due = 53 + 45 = 98
    // transfert = 59 - 98 = -39 → depuis_epargne
    expect(out.totalPeriodiquesMois.toNumber()).toBe(98);
    expect(out.transfertRecommandeAjuste.toFixed(2)).toBe('-39.00');
    expect(out.direction).toBe('depuis_epargne');
  });

  it('reproduces ADR-012 example: virer 6€ when only Dashlane (53€) is due in April', () => {
    // Per ADR-012: provisionMensuelleTotale = 59, Dashlane only due in April → 59 - 53 = 6.
    // Real Thierry has S.W.D.E too but ADR's pedagogical example assumes only Dashlane.
    const charges = [
      charge({ id: 'dashlane', amount: new Decimal(53), frequency: 'annual', paymentMonths: [4] }),
      // 4 dummy provisions to round provision to ~59€ (without bills due in April)
      charge({ id: 'a', amount: new Decimal(180), frequency: 'annual', paymentMonths: [6] }),
      charge({ id: 'b', amount: new Decimal(120), frequency: 'annual', paymentMonths: [3] }),
      charge({ id: 'c', amount: new Decimal(120), frequency: 'annual', paymentMonths: [9] }),
      charge({ id: 'd', amount: new Decimal(235), frequency: 'annual', paymentMonths: [12] }),
    ];
    // 53/12 + 180/12 + 120/12 + 120/12 + 235/12 = (53+180+120+120+235)/12 = 708/12 = 59
    const out = calculerAssistantVirements({
      charges,
      ref: ref(2026, 4),
      rattrapageMensuel: ZERO,
    });
    expect(out.provisionMensuelleTotale.toFixed(2)).toBe('59.00');
    expect(out.totalPeriodiquesMois.toNumber()).toBe(53);
    expect(out.transfertRecommandeAjuste.toFixed(2)).toBe('6.00');
    expect(out.direction).toBe('vers_epargne');
  });
});

describe('calculerAssistantVirements — semiannual support', () => {
  it('lisses semiannual amount across 6 months for provision math', () => {
    const out = calculerAssistantVirements({
      charges: [
        charge({ amount: new Decimal(600), frequency: 'semiannual', paymentMonths: [3, 9] }),
      ],
      ref: ref(2026, 5),
      rattrapageMensuel: ZERO,
    });
    expect(out.provisionMensuelleTotale.toNumber()).toBe(100);
    expect(out.transfertRecommandeAjuste.toNumber()).toBe(100);
    expect(out.direction).toBe('vers_epargne');
  });

  it('detects a semiannual bill due in the reference month', () => {
    const out = calculerAssistantVirements({
      charges: [
        charge({ amount: new Decimal(600), frequency: 'semiannual', paymentMonths: [3, 9] }),
      ],
      ref: ref(2026, 9),
      rattrapageMensuel: ZERO,
    });
    expect(out.totalPeriodiquesMois.toNumber()).toBe(600);
    expect(out.transfertRecommandeAjuste.toNumber()).toBe(-500);
    expect(out.direction).toBe('depuis_epargne');
  });

  it('mixes semiannual + quarterly + annual in the same workspace', () => {
    const out = calculerAssistantVirements({
      charges: [
        charge({ amount: new Decimal(600), frequency: 'semiannual', paymentMonths: [3, 9] }),
        charge({ amount: new Decimal(45), frequency: 'quarterly', paymentMonths: [1, 4, 7, 10] }),
        charge({ amount: new Decimal(1200), frequency: 'annual', paymentMonths: [12] }),
      ],
      ref: ref(2026, 5), // none due in May
      rattrapageMensuel: ZERO,
    });
    // 600/6 + 45/3 + 1200/12 = 100 + 15 + 100 = 215
    expect(out.provisionMensuelleTotale.toNumber()).toBe(215);
    expect(out.totalPeriodiquesMois.toNumber()).toBe(0);
    expect(out.direction).toBe('vers_epargne');
  });
});

describe('calculerAssistantVirements — rattrapage', () => {
  it('adds rattrapage to the recommended transfer', () => {
    const out = calculerAssistantVirements({
      charges: [charge({ amount: new Decimal(1200), frequency: 'annual', paymentMonths: [3] })],
      ref: ref(2026, 5),
      rattrapageMensuel: new Decimal(50),
    });
    // provision 100, no bill, rattrapage +50 → 150
    expect(out.transfertRecommande.toNumber()).toBe(100);
    expect(out.transfertRecommandeAjuste.toNumber()).toBe(150);
    expect(out.direction).toBe('vers_epargne');
  });

  it('keeps "depuis_epargne" when bills - provisions + rattrapage is still negative', () => {
    const out = calculerAssistantVirements({
      charges: [
        charge({ amount: new Decimal(1200), frequency: 'annual', paymentMonths: [3] }), // 100/mo
        charge({ amount: new Decimal(500), frequency: 'annual', paymentMonths: [5] }), // 41.66/mo
      ],
      ref: ref(2026, 5),
      rattrapageMensuel: new Decimal(20),
    });
    // provision = 141.66…, due in May = 500
    // transfert = 141.66… - 500 + 20 = -338.33…
    expect(out.direction).toBe('depuis_epargne');
    expect(out.transfertRecommandeAjuste.toFixed(2)).toBe('-338.33');
  });

  it('flips the direction when rattrapage is large enough', () => {
    const out = calculerAssistantVirements({
      charges: [charge({ amount: new Decimal(60), frequency: 'monthly' })], // not periodic
      ref: ref(2026, 5),
      rattrapageMensuel: new Decimal(150),
    });
    // provision = 0, no periodic, rattrapage 150 → vers_epargne 150
    expect(out.transfertRecommandeAjuste.toNumber()).toBe(150);
    expect(out.direction).toBe('vers_epargne');
  });
});

describe('calculerAssistantVirements — détail provisions', () => {
  it('exposes per-charge breakdown', () => {
    const out = calculerAssistantVirements({
      charges: [
        charge({
          id: 'a',
          label: 'A',
          amount: new Decimal(120),
          frequency: 'annual',
          paymentMonths: [3],
        }),
        charge({
          id: 'b',
          label: 'B',
          amount: new Decimal(300),
          frequency: 'quarterly',
          paymentMonths: [1, 4, 7, 10],
        }),
        charge({ id: 'c', label: 'C', amount: new Decimal(900), frequency: 'monthly' }),
      ],
      ref: ref(2026, 5),
      rattrapageMensuel: ZERO,
    });
    expect(out.detailProvisions).toHaveLength(2); // monthly excluded
    const a = out.detailProvisions.find((d) => d.chargeId === 'a');
    const b = out.detailProvisions.find((d) => d.chargeId === 'b');
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a!.provisionLissee.toNumber()).toBe(10);
    expect(b!.provisionLissee.toNumber()).toBe(100);
  });

  it('returns an empty détail when only monthly charges exist', () => {
    const out = calculerAssistantVirements({
      charges: [charge({ amount: new Decimal(900), frequency: 'monthly' })],
      ref: ref(2026, 5),
      rattrapageMensuel: ZERO,
    });
    expect(out.detailProvisions).toHaveLength(0);
  });

  it('keeps Decimal precision in provisionLissee', () => {
    const out = calculerAssistantVirements({
      charges: [
        charge({ id: 'd', amount: new Decimal(53), frequency: 'annual', paymentMonths: [4] }),
      ],
      ref: ref(2026, 5),
      rattrapageMensuel: ZERO,
    });
    expect(out.detailProvisions[0]!.provisionLissee.toFixed(6)).toBe('4.416667');
  });

  it('returns label in détail entry (UI consumes it directly)', () => {
    const out = calculerAssistantVirements({
      charges: [
        charge({
          id: 'water',
          label: 'S.W.D.E.',
          amount: new Decimal(45),
          frequency: 'quarterly',
          paymentMonths: [1, 4, 7, 10],
        }),
      ],
      ref: ref(2026, 5),
      rattrapageMensuel: ZERO,
    });
    expect(out.detailProvisions[0]!.label).toBe('S.W.D.E.');
    expect(out.detailProvisions[0]!.frequency).toBe('quarterly');
  });
});

describe('calculerAssistantVirements — robustness', () => {
  it('handles a charge whose paymentMonths is a single entry', () => {
    const out = calculerAssistantVirements({
      charges: [charge({ amount: new Decimal(120), frequency: 'annual', paymentMonths: [11] })],
      ref: ref(2026, 11),
      rattrapageMensuel: ZERO,
    });
    expect(out.totalPeriodiquesMois.toNumber()).toBe(120);
  });

  it('handles a charge whose paymentMonths covers all 12 months', () => {
    // Edge case: a "monthly-shaped quarterly" — uncommon but valid.
    const out = calculerAssistantVirements({
      charges: [
        charge({
          amount: new Decimal(60),
          frequency: 'quarterly',
          paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        }),
      ],
      ref: ref(2026, 5),
      rattrapageMensuel: ZERO,
    });
    expect(out.provisionMensuelleTotale.toNumber()).toBe(20);
    expect(out.totalPeriodiquesMois.toNumber()).toBe(60);
    expect(out.transfertRecommandeAjuste.toNumber()).toBe(-40);
  });

  it('returns zero direction "aucun" when only inactive periodic charges remain', () => {
    const out = calculerAssistantVirements({
      charges: [
        charge({
          amount: new Decimal(300),
          frequency: 'annual',
          paymentMonths: [3],
          isActive: false,
        }),
      ],
      ref: ref(2026, 5),
      rattrapageMensuel: ZERO,
    });
    expect(out.provisionMensuelleTotale.toNumber()).toBe(0);
    expect(out.totalPeriodiquesMois.toNumber()).toBe(0);
    expect(out.direction).toBe('aucun');
  });
});
