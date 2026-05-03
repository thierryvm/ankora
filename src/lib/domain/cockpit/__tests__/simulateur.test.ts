import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

import { simulerEconomie } from '@/lib/domain/cockpit/simulateur';
import type { CockpitCharge } from '@/lib/domain/cockpit/types';

const charge = (over: Partial<CockpitCharge>): CockpitCharge => ({
  id: over.id ?? 'c-' + Math.random().toString(36).slice(2),
  label: over.label ?? 'Test',
  amount: over.amount ?? new Decimal(0),
  frequency: over.frequency ?? 'monthly',
  paymentMonths: over.paymentMonths ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  paymentDay: over.paymentDay ?? 1,
  isActive: over.isActive ?? true,
});

describe('simulerEconomie', () => {
  it('monthly — économie = différence directe', () => {
    const out = simulerEconomie({
      charge: charge({ amount: new Decimal(80), frequency: 'monthly' }),
      nouveauPrix: new Decimal(50),
    });
    expect(out.difference.toNumber()).toBe(30);
    expect(out.economieMensuelleLissee.toNumber()).toBe(30);
    expect(out.economieAnnuelle.toNumber()).toBe(360);
  });

  it('quarterly — économie / 3', () => {
    const out = simulerEconomie({
      charge: charge({ amount: new Decimal(60), frequency: 'quarterly' }),
      nouveauPrix: new Decimal(45),
    });
    expect(out.difference.toNumber()).toBe(15);
    expect(out.economieMensuelleLissee.toNumber()).toBe(5);
    expect(out.economieAnnuelle.toNumber()).toBe(60);
  });

  it('semiannual — économie / 6', () => {
    const out = simulerEconomie({
      charge: charge({ amount: new Decimal(600), frequency: 'semiannual' }),
      nouveauPrix: new Decimal(540),
    });
    expect(out.difference.toNumber()).toBe(60);
    expect(out.economieMensuelleLissee.toNumber()).toBe(10);
    expect(out.economieAnnuelle.toNumber()).toBe(120);
  });

  it('annual — économie / 12', () => {
    const out = simulerEconomie({
      charge: charge({ amount: new Decimal(53), frequency: 'annual' }),
      nouveauPrix: new Decimal(35),
    });
    expect(out.difference.toNumber()).toBe(18);
    expect(out.economieMensuelleLissee.toFixed(2)).toBe('1.50');
    expect(out.economieAnnuelle.toNumber()).toBe(18);
  });

  it('handles a price increase (negative économie)', () => {
    const out = simulerEconomie({
      charge: charge({ amount: new Decimal(50), frequency: 'monthly' }),
      nouveauPrix: new Decimal(70),
    });
    expect(out.difference.toNumber()).toBe(-20);
    expect(out.economieMensuelleLissee.toNumber()).toBe(-20);
    expect(out.economieAnnuelle.toNumber()).toBe(-240);
  });

  it('returns zero when nouveauPrix equals current amount', () => {
    const out = simulerEconomie({
      charge: charge({ amount: new Decimal(100), frequency: 'monthly' }),
      nouveauPrix: new Decimal(100),
    });
    expect(out.difference.toNumber()).toBe(0);
    expect(out.economieMensuelleLissee.toNumber()).toBe(0);
    expect(out.economieAnnuelle.toNumber()).toBe(0);
  });

  it('preserves Decimal precision on annual / 12 calculations', () => {
    const out = simulerEconomie({
      charge: charge({ amount: new Decimal(53), frequency: 'annual' }),
      nouveauPrix: new Decimal(0),
    });
    // diff = 53, lissée = 53/12 = 4.4166…, annuelle = 53
    expect(out.economieMensuelleLissee.toFixed(6)).toBe('4.416667');
    expect(out.economieAnnuelle.toNumber()).toBe(53);
  });
});
