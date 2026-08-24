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

describe('calculerSituationDuMois — les deux chiffres de la projection', () => {
  const base = {
    revenus: new Decimal(2500),
    charges: [charge({ amount: new Decimal(1838), frequency: 'monthly' as const })],
    soldeEpargneActuel: new Decimal(0),
    payments: NO_PAYMENTS,
    ref: REF,
    engagementsMensuels: new Decimal(0),
    depensesDuMois: new Decimal(200),
    joursDuMois: 30,
  };

  it('les rend ENSEMBLE, et elles se recomposent au centime', () => {
    // `depensesProjetees` a été extraite d'`epargneEstimee`, qui l'appelle
    // désormais. Les deux modules le testent chacun de leur côté ; rien ne le
    // vérifiait à l'AGRÉGAT, c'est-à-dire à l'endroit où l'écran les lit. Le
    // champ neuf de `SituationDuMois` n'avait aucune assertion propre.
    const out = calculerSituationDuMois({ ...base, joursEcoules: 15 });
    expect(out.depensesProjetees).not.toBeNull();
    expect(out.epargneEstimee).not.toBeNull();
    expect(out.resteDisponible.minus(out.depensesProjetees!).toFixed(6)).toBe(
      out.epargneEstimee!.toFixed(6),
    );
  });

  it('sont nulles ensemble avant le septième jour', () => {
    // L'état « la courbe s'arrête mais la cascade affiche encore une
    // estimation » n'a pas de sens à l'écran. Les deux sortent de la même
    // fonction ; ce cas le tient là où la page les lit.
    const out = calculerSituationDuMois({ ...base, joursEcoules: 6 });
    expect(out.depensesProjetees).toBeNull();
    expect(out.epargneEstimee).toBeNull();
  });
});

describe('calculerSituationDuMois', () => {
  it('statut vert when capacité ≥ 0 and provisions à jour (no periodic charge)', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(2500),
      charges: [charge({ amount: new Decimal(1838), frequency: 'monthly' })],
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(0),
      depensesDuMois: new Decimal(0),
      joursEcoules: 15,
      joursDuMois: 30,
    });
    expect(out.statut).toBe('vert');
    expect(out.hasRevenus).toBe(true);
    expect(out.resteDisponible.toNumber()).toBe(662);
    expect(out.provisionsAJour).toBe(true);
  });

  // ADR-035 — the orange branch used to fire on `capacité < 0`, i.e. on a
  // user-invented envelope being exceeded. It now fires on « Il te reste »
  // going below zero: spending more this month than the month actually had.
  it('statut orange when ilTeReste < 0 but resteDisponible ≥ 0', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(2000),
      charges: [charge({ amount: new Decimal(1500), frequency: 'monthly' })],
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(0),
      depensesDuMois: new Decimal(600), // 500 available, 600 spent
      joursEcoules: 15,
      joursDuMois: 30,
    });
    expect(out.statut).toBe('orange');
    expect(out.resteDisponible.toNumber()).toBe(500);
    expect(out.ilTeReste.toNumber()).toBe(-100);
  });

  it('statut vert when the month is untouched — no envelope to fall short of', () => {
    // Before ADR-035 this exact input was orange, because 500 € of income left
    // over was less than the 800 € the user had told the app they wanted to
    // spend. Nothing about their month was wrong; only the guess was.
    const out = calculerSituationDuMois({
      revenus: new Decimal(2000),
      charges: [charge({ amount: new Decimal(1500), frequency: 'monthly' })],
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(0),
      depensesDuMois: new Decimal(0),
      joursEcoules: 15,
      joursDuMois: 30,
    });
    expect(out.statut).toBe('vert');
    expect(out.ilTeReste.toNumber()).toBe(500);
  });

  it('statut orange when provisions en déficit even if capacité ≥ 0', () => {
    // Annual 1200 due in March (paymentMonths [3]); ref month 6 → 9 months
    // until next due → épargne requise 300 > solde 0 → déficit.
    const out = calculerSituationDuMois({
      revenus: new Decimal(3000),
      charges: [charge({ amount: new Decimal(1200), frequency: 'annual', paymentMonths: [3] })],
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(0),
      depensesDuMois: new Decimal(0),
      joursEcoules: 15,
      joursDuMois: 30,
    });
    expect(out.statut).toBe('orange');
    expect(out.provisionsAJour).toBe(false);
    expect(out.deficitEpargne.toNumber()).toBe(300);
  });

  it('statut rouge when charges + provisions exceed revenus (resteDisponible < 0)', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(1000),
      charges: [charge({ amount: new Decimal(1500), frequency: 'monthly' })],
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(0),
      depensesDuMois: new Decimal(0),
      joursEcoules: 15,
      joursDuMois: 30,
    });
    expect(out.statut).toBe('rouge');
    expect(out.resteDisponible.toNumber()).toBe(-500);
  });

  it('statut incomplet when revenus is null (THI-335) — no negative propagated to statut', () => {
    const out = calculerSituationDuMois({
      revenus: null,
      charges: [charge({ amount: new Decimal(900), frequency: 'monthly' })],
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(0),
      depensesDuMois: new Decimal(0),
      joursEcoules: 15,
      joursDuMois: 30,
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
      soldeEpargneActuel: new Decimal(10000),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(0),
      depensesDuMois: new Decimal(0),
      joursEcoules: 15,
      joursDuMois: 30,
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
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(0),
      depensesDuMois: new Decimal(0),
      joursEcoules: 15,
      joursDuMois: 30,
    });
    expect(out.chargesFixes.toNumber()).toBe(900);
    // Whole-chain proof: the inactive 800 must not leak past chargesFixes.
    expect(out.resteDisponible.toNumber()).toBe(1100); // 2000 − 900 − 0
  });

  it('statut vert on an empty workspace', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(2500),
      charges: [],
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(0),
      depensesDuMois: new Decimal(0),
      joursEcoules: 15,
      joursDuMois: 30,
    });
    expect(out.statut).toBe('vert');
    expect(out.resteDisponible.toNumber()).toBe(2500);
  });

  it('ADR-021: engagements lower resteDisponible and capacité by their amount', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(3000),
      charges: [charge({ amount: new Decimal(1000), frequency: 'monthly' })],
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(300),
      depensesDuMois: new Decimal(0),
      joursEcoules: 15,
      joursDuMois: 30,
    });
    expect(out.engagementsMensuels.toNumber()).toBe(300);
    expect(out.resteDisponible.toNumber()).toBe(1700); // 3000 − 1000 − 0 − 300
    expect(out.statut).toBe('vert');
  });

  it('ADR-021 + ADR-035: engagements shrink what is left, and spending can tip it orange', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(2500),
      charges: [charge({ amount: new Decimal(1838), frequency: 'monthly' })],
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(200),
      depensesDuMois: new Decimal(500), // 462 available, 500 spent
      joursEcoules: 15,
      joursDuMois: 30,
    });
    expect(out.resteDisponible.toNumber()).toBe(462); // 2500 − 1838 − 200
    expect(out.ilTeReste.toNumber()).toBe(-38);
    expect(out.statut).toBe('orange');
  });

  it('ADR-021: engagements can tip statut into rouge (resteDisponible < 0)', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(1000),
      charges: [charge({ amount: new Decimal(800), frequency: 'monthly' })],
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
      engagementsMensuels: new Decimal(300),
      depensesDuMois: new Decimal(0),
      joursEcoules: 15,
      joursDuMois: 30,
    });
    // Without engagements resteDisponible would be 200 (≥ 0); −300 flips it under.
    expect(out.resteDisponible.toNumber()).toBe(-100); // 1000 − 800 − 300
    expect(out.statut).toBe('rouge');
  });
});
