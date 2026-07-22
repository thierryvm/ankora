import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

import { calculerSituationDuMois } from '@/lib/domain/cockpit/situation-mois';
import type { CockpitCharge, PaymentLedger, ReferencePeriod } from '@/lib/domain/cockpit/types';

const NO_PAYMENTS: PaymentLedger = new Map();
const REF: ReferencePeriod = { year: 2026, month: 6 };

const charge = (over: Partial<CockpitCharge>): CockpitCharge => ({
  id: over.id ?? 'c-' + Math.random().toString(36).slice(2),
  label: 'Test',
  amount: new Decimal(0),
  frequency: 'monthly',
  paymentMonths: [1],
  paymentDay: 1,
  isActive: true,
  ...over,
});

describe('calculerSituationDuMois', () => {
  it('statut vert when capacité ≥ 0 and provisions à jour (no periodic charge)', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(2500),
      charges: [charge({ amount: new Decimal(1838), frequency: 'monthly' })],
      budgetVieCourante: new Decimal(500),
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(0),
    });
    expect(out.statut).toBe('vert');
    expect(out.hasRevenus).toBe(true);
    expect(out.resteDisponible.toNumber()).toBe(662);
    expect(out.capacite.toNumber()).toBe(162);
    expect(out.provisionsAJour).toBe(true);
  });

  it('statut orange when capacité < 0 but resteDisponible ≥ 0', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(2000),
      charges: [charge({ amount: new Decimal(1500), frequency: 'monthly' })],
      budgetVieCourante: new Decimal(800),
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(0),
    });
    expect(out.statut).toBe('orange');
    expect(out.resteDisponible.toNumber()).toBe(500);
    expect(out.capacite.toNumber()).toBe(-300);
  });

  it('statut orange when provisions en déficit even if capacité ≥ 0', () => {
    // Annual 1200 due in March (paymentMonths [3]); ref month 6 → 9 months
    // until next due → épargne requise 300 > solde 0 → déficit.
    const out = calculerSituationDuMois({
      revenus: new Decimal(3000),
      charges: [charge({ amount: new Decimal(1200), frequency: 'annual', paymentMonths: [3] })],
      budgetVieCourante: new Decimal(500),
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(0),
    });
    expect(out.statut).toBe('orange');
    expect(out.capacite.gte(0)).toBe(true);
    expect(out.provisionsAJour).toBe(false);
    expect(out.deficitEpargne.toNumber()).toBe(300);
  });

  it('statut rouge when charges + provisions exceed revenus (resteDisponible < 0)', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(1000),
      charges: [charge({ amount: new Decimal(1500), frequency: 'monthly' })],
      budgetVieCourante: new Decimal(500),
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(0),
    });
    expect(out.statut).toBe('rouge');
    expect(out.resteDisponible.toNumber()).toBe(-500);
  });

  it('statut incomplet when revenus is null (THI-335) — no negative propagated to statut', () => {
    const out = calculerSituationDuMois({
      revenus: null,
      charges: [charge({ amount: new Decimal(900), frequency: 'monthly' })],
      budgetVieCourante: new Decimal(500),
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(0),
    });
    expect(out.statut).toBe('incomplet');
    expect(out.hasRevenus).toBe(false);
    expect(out.revenus.toNumber()).toBe(0);
  });

  it('exposes chargesFixes and provisionsLissees split separately', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(3000),
      charges: [
        charge({ amount: new Decimal(1500), frequency: 'monthly' }),
        charge({ amount: new Decimal(1200), frequency: 'annual', paymentMonths: [3] }),
      ],
      budgetVieCourante: new Decimal(0),
      soldeEpargneActuel: new Decimal(10000),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(0),
    });
    expect(out.chargesFixes.toNumber()).toBe(1500);
    expect(out.provisionsLissees.toNumber()).toBe(100); // 1200 / 12
    expect(out.resteDisponible.toNumber()).toBe(1400); // 3000 - 1500 - 100
  });

  it('ignores inactive charges', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(2000),
      charges: [
        charge({ amount: new Decimal(900), frequency: 'monthly' }),
        charge({ amount: new Decimal(800), frequency: 'monthly', isActive: false }),
      ],
      budgetVieCourante: new Decimal(0),
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(0),
    });
    expect(out.chargesFixes.toNumber()).toBe(900);
    // Whole-chain proof: the inactive 800 must not leak past chargesFixes.
    expect(out.resteDisponible.toNumber()).toBe(1100); // 2000 − 900 − 0
  });

  it('statut vert on an empty workspace with budgetVieCourante only', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(2500),
      charges: [],
      budgetVieCourante: new Decimal(700),
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(0),
    });
    expect(out.statut).toBe('vert');
    expect(out.resteDisponible.toNumber()).toBe(2500);
    expect(out.capacite.toNumber()).toBe(1800);
  });

  it('ADR-021: engagements lower resteDisponible and capacité by their amount', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(3000),
      charges: [charge({ amount: new Decimal(1000), frequency: 'monthly' })],
      budgetVieCourante: new Decimal(500),
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(300),
    });
    expect(out.engagementsMensuels.toNumber()).toBe(300);
    expect(out.resteDisponible.toNumber()).toBe(1700); // 3000 − 1000 − 0 − 300
    expect(out.capacite.toNumber()).toBe(1200); // 1700 − 500
    expect(out.statut).toBe('vert');
  });

  it('ADR-021: engagements can tip statut vert → orange (capacité < 0)', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(2500),
      charges: [charge({ amount: new Decimal(1838), frequency: 'monthly' })],
      budgetVieCourante: new Decimal(500),
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(200),
    });
    // Same base as the first test (was vert, capacité 162); −200 tips capacité negative.
    expect(out.resteDisponible.toNumber()).toBe(462); // 2500 − 1838 − 200
    expect(out.capacite.toNumber()).toBe(-38);
    expect(out.statut).toBe('orange');
  });

  it('ADR-021: engagements can tip statut into rouge (resteDisponible < 0)', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(1000),
      charges: [charge({ amount: new Decimal(800), frequency: 'monthly' })],
      budgetVieCourante: new Decimal(100),
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(300),
    });
    // Without engagements resteDisponible would be 200 (≥ 0); −300 flips it under.
    expect(out.resteDisponible.toNumber()).toBe(-100); // 1000 − 800 − 300
    expect(out.statut).toBe('rouge');
  });
});
