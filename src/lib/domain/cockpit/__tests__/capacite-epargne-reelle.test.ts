import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

import { capaciteEpargneReelle } from '@/lib/domain/cockpit/capacite-epargne-reelle';
import type { CockpitCharge } from '@/lib/domain/cockpit/types';

const charge = (over: Partial<CockpitCharge>): CockpitCharge => ({
  id: over.id ?? 'c-' + Math.random().toString(36).slice(2),
  label: 'Test',
  amount: new Decimal(0),
  frequency: 'monthly',
  paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  paymentDay: 1,
  isActive: true,
  ...over,
});

describe('capaciteEpargneReelle', () => {
  it('equals revenus when there are no charges and no plafond', () => {
    const out = capaciteEpargneReelle({
      revenus: new Decimal(2000),
      charges: [],
      plafondQuotidien: new Decimal(0),
    });
    expect(out.capacite.toNumber()).toBe(2000);
    expect(out.isPositive).toBe(true);
    expect(out.effortFinancierLisse.toNumber()).toBe(0);
  });

  it('subtracts the plafond quotidien even if charges are zero', () => {
    const out = capaciteEpargneReelle({
      revenus: new Decimal(2000),
      charges: [],
      plafondQuotidien: new Decimal(500),
    });
    expect(out.capacite.toNumber()).toBe(1500);
  });

  it('subtracts a single monthly charge', () => {
    const out = capaciteEpargneReelle({
      revenus: new Decimal(2000),
      charges: [charge({ amount: new Decimal(900), frequency: 'monthly' })],
      plafondQuotidien: new Decimal(500),
    });
    // 2000 - 900 - 500 = 600
    expect(out.capacite.toNumber()).toBe(600);
    expect(out.effortFinancierLisse.toNumber()).toBe(900);
  });

  it('lisses an annual charge across 12 months', () => {
    const out = capaciteEpargneReelle({
      revenus: new Decimal(2000),
      charges: [charge({ amount: new Decimal(1200), frequency: 'annual', paymentMonths: [3] })],
      plafondQuotidien: new Decimal(0),
    });
    expect(out.capacite.toNumber()).toBe(1900);
  });

  it('lisses a semiannual charge across 6 months', () => {
    const out = capaciteEpargneReelle({
      revenus: new Decimal(1000),
      charges: [
        charge({ amount: new Decimal(600), frequency: 'semiannual', paymentMonths: [3, 9] }),
      ],
      plafondQuotidien: new Decimal(0),
    });
    expect(out.capacite.toNumber()).toBe(900);
  });

  it('lisses a quarterly charge across 3 months', () => {
    const out = capaciteEpargneReelle({
      revenus: new Decimal(1000),
      charges: [
        charge({ amount: new Decimal(45), frequency: 'quarterly', paymentMonths: [1, 4, 7, 10] }),
      ],
      plafondQuotidien: new Decimal(0),
    });
    expect(out.capacite.toNumber()).toBe(985);
  });

  it('returns negative when charges exceed revenus', () => {
    const out = capaciteEpargneReelle({
      revenus: new Decimal(1000),
      charges: [charge({ amount: new Decimal(1500), frequency: 'monthly' })],
      plafondQuotidien: new Decimal(0),
    });
    expect(out.capacite.toNumber()).toBe(-500);
    expect(out.isPositive).toBe(false);
  });

  it('returns negative when plafond exceeds revenus on its own', () => {
    const out = capaciteEpargneReelle({
      revenus: new Decimal(800),
      charges: [],
      plafondQuotidien: new Decimal(1000),
    });
    expect(out.capacite.toNumber()).toBe(-200);
  });

  it('handles revenus = 0 (massively negative)', () => {
    const out = capaciteEpargneReelle({
      revenus: new Decimal(0),
      charges: [charge({ amount: new Decimal(100), frequency: 'monthly' })],
      plafondQuotidien: new Decimal(50),
    });
    expect(out.capacite.toNumber()).toBe(-150);
  });

  it('treats capacite = 0 as positive (≥ 0)', () => {
    const out = capaciteEpargneReelle({
      revenus: new Decimal(1000),
      charges: [],
      plafondQuotidien: new Decimal(1000),
    });
    expect(out.capacite.toNumber()).toBe(0);
    expect(out.isPositive).toBe(true);
  });

  it('mixes monthly + annual + quarterly + semiannual', () => {
    // Reproduces the @thierry fixture (≈ 59€ provisions) plus 1500€ monthly,
    // 2000 revenus, 500 plafond.
    const charges = [
      charge({ amount: new Decimal(1500), frequency: 'monthly' }),
      charge({ amount: new Decimal(53), frequency: 'annual', paymentMonths: [4] }),
      charge({
        amount: new Decimal(45),
        frequency: 'quarterly',
        paymentMonths: [1, 4, 7, 10],
      }),
      charge({ amount: new Decimal(300), frequency: 'annual', paymentMonths: [6] }),
      charge({ amount: new Decimal(120), frequency: 'annual', paymentMonths: [3] }),
      charge({ amount: new Decimal(55), frequency: 'annual', paymentMonths: [3] }),
      charge({ amount: new Decimal(600), frequency: 'semiannual', paymentMonths: [2, 8] }),
    ];
    // monthly = 1500
    // provisions = 53/12 + 45/3 + 300/12 + 120/12 + 55/12 + 600/6
    //            = 4.4166… + 15 + 25 + 10 + 4.5833… + 100 = 159
    // effort = 1659
    // capacite = 2000 - 1659 - 500 = -159
    const out = capaciteEpargneReelle({
      revenus: new Decimal(2000),
      charges,
      plafondQuotidien: new Decimal(500),
    });
    expect(out.effortFinancierLisse.toFixed(2)).toBe('1659.00');
    expect(out.capacite.toFixed(2)).toBe('-159.00');
  });

  it('keeps decimal precision for divisions that recur', () => {
    // 53 / 12 over many additions should stay close to exact.
    const charges = Array.from({ length: 12 }, () =>
      charge({ amount: new Decimal(53), frequency: 'annual', paymentMonths: [4] }),
    );
    const out = capaciteEpargneReelle({
      revenus: new Decimal(0),
      charges,
      plafondQuotidien: new Decimal(0),
    });
    // 12 × 53/12 = 53 exactly, capacite = -53.
    expect(out.capacite.toFixed(6)).toBe('-53.000000');
  });

  it('ignores inactive charges', () => {
    const out = capaciteEpargneReelle({
      revenus: new Decimal(2000),
      charges: [
        charge({ amount: new Decimal(900), frequency: 'monthly' }),
        charge({ amount: new Decimal(800), frequency: 'monthly', isActive: false }),
      ],
      plafondQuotidien: new Decimal(0),
    });
    expect(out.capacite.toNumber()).toBe(1100);
  });

  it('exposes effort separately from capacite (UI breakdown)', () => {
    const out = capaciteEpargneReelle({
      revenus: new Decimal(3000),
      charges: [
        charge({ amount: new Decimal(1500), frequency: 'monthly' }),
        charge({ amount: new Decimal(1200), frequency: 'annual', paymentMonths: [3] }),
      ],
      plafondQuotidien: new Decimal(500),
    });
    expect(out.effortFinancierLisse.toNumber()).toBe(1600); // 1500 + 100
    expect(out.capacite.toNumber()).toBe(900); // 3000 - 1600 - 500
  });

  it('handles a workspace where plafond is the only outflow (early signup)', () => {
    const out = capaciteEpargneReelle({
      revenus: new Decimal(2500),
      charges: [],
      plafondQuotidien: new Decimal(700),
    });
    expect(out.capacite.toNumber()).toBe(1800);
    expect(out.isPositive).toBe(true);
  });
});

describe('capaciteEpargneReelle — PR-BETA-3 tryptique (ADR-009 amendement 2026-05-09)', () => {
  it('exposes resteDisponible = revenus - effort, separate from capacite', () => {
    const out = capaciteEpargneReelle({
      revenus: new Decimal(2500),
      charges: [charge({ amount: new Decimal(1838), frequency: 'monthly' })],
      resteAVivre: new Decimal(500),
    });
    // resteDisponible should NOT include the reste-à-vivre subtraction.
    expect(out.resteDisponible.toNumber()).toBe(662);
    expect(out.resteAVivre.toNumber()).toBe(500);
    expect(out.capacite.toNumber()).toBe(162);
  });

  it('reproduces the @thierry persona (662 / 500 / 162) — canonical fixture', () => {
    // Cf. ADR-009 amendement lignes 252-256 + Athenaeum profil-financier.md.
    // Effort = 1838 ≈ 1500 loyer + ~338 charges variées (lissées).
    const out = capaciteEpargneReelle({
      revenus: new Decimal(2500),
      charges: [charge({ amount: new Decimal(1838), frequency: 'monthly' })],
      resteAVivre: new Decimal(500),
    });
    expect(out.resteDisponible.toFixed(2)).toBe('662.00');
    expect(out.resteAVivre.toFixed(2)).toBe('500.00');
    expect(out.capacite.toFixed(2)).toBe('162.00');
    expect(out.isPositive).toBe(true);
  });

  it('handles resteAVivre = 0 (capacite collapses to resteDisponible)', () => {
    const out = capaciteEpargneReelle({
      revenus: new Decimal(2000),
      charges: [charge({ amount: new Decimal(800), frequency: 'monthly' })],
      resteAVivre: new Decimal(0),
    });
    expect(out.resteDisponible.toNumber()).toBe(1200);
    expect(out.capacite.toNumber()).toBe(1200);
  });

  it('returns negative capacite when resteAVivre exceeds resteDisponible', () => {
    const out = capaciteEpargneReelle({
      revenus: new Decimal(2000),
      charges: [charge({ amount: new Decimal(1500), frequency: 'monthly' })],
      resteAVivre: new Decimal(800),
    });
    expect(out.resteDisponible.toNumber()).toBe(500);
    expect(out.capacite.toNumber()).toBe(-300);
    expect(out.isPositive).toBe(false);
  });

  it('accepts the legacy plafondQuotidien input shape (back-compat)', () => {
    // Existing call-sites (PR-D3 CapaciteEpargneCard) still pass
    // `plafondQuotidien`. They must keep working until PR-BETA-3 lands.
    const out = capaciteEpargneReelle({
      revenus: new Decimal(2000),
      charges: [charge({ amount: new Decimal(900), frequency: 'monthly' })],
      plafondQuotidien: new Decimal(400),
    });
    expect(out.resteDisponible.toNumber()).toBe(1100);
    expect(out.resteAVivre.toNumber()).toBe(400);
    expect(out.capacite.toNumber()).toBe(700);
  });

  it('keeps decimal precision in resteDisponible across many annual provisions', () => {
    // 53€/an × 12 = 53€ via lissage strict.
    const charges = Array.from({ length: 12 }, () =>
      charge({ amount: new Decimal(53), frequency: 'annual', paymentMonths: [4] }),
    );
    const out = capaciteEpargneReelle({
      revenus: new Decimal(2000),
      charges,
      resteAVivre: new Decimal(0),
    });
    expect(out.resteDisponible.toFixed(6)).toBe('1947.000000');
    expect(out.capacite.toFixed(6)).toBe('1947.000000');
  });
});
