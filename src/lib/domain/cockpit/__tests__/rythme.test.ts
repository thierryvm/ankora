import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { ecartAuRythme, rythmeAuJour, sensDeLEcart } from '../rythme';

// Fictitious household (public repo): a 505 € month budget.
describe('rythmeAuJour', () => {
  it('is the budget × day ÷ days of the month, rounded to the cent', () => {
    expect(rythmeAuJour(new Decimal(505), 10, 30)?.toFixed(2)).toBe('168.33');
    expect(rythmeAuJour(new Decimal(505), 30, 30)?.toFixed(2)).toBe('505.00');
    expect(rythmeAuJour(new Decimal(705), 1, 31)?.toFixed(2)).toBe('22.74');
  });

  it('is zero on day 0', () => {
    expect(rythmeAuJour(new Decimal(505), 0, 30)?.toFixed(2)).toBe('0.00');
  });

  it('has no rhythm without a positive budget', () => {
    expect(rythmeAuJour(new Decimal(0), 10, 30)).toBeNull();
    expect(rythmeAuJour(new Decimal(-12), 10, 30)).toBeNull();
  });

  it('has no rhythm for a month without days or a day out of the month', () => {
    expect(rythmeAuJour(new Decimal(505), 3, 0)).toBeNull();
    expect(rythmeAuJour(new Decimal(505), 3, Number.NaN)).toBeNull();
    expect(rythmeAuJour(new Decimal(505), 31, 30)).toBeNull();
    expect(rythmeAuJour(new Decimal(505), -1, 30)).toBeNull();
  });
});

describe('ecartAuRythme', () => {
  it('is spent minus rhythm, negative under the rhythm', () => {
    expect(ecartAuRythme(new Decimal(100), new Decimal(168.33)).toFixed(2)).toBe('-68.33');
    expect(ecartAuRythme(new Decimal(200), new Decimal(168.33)).toFixed(2)).toBe('31.67');
  });
});

describe('sensDeLEcart', () => {
  it('reads « pile » under 0.50 € either way', () => {
    expect(sensDeLEcart(new Decimal(0.49))).toBe('pile');
    expect(sensDeLEcart(new Decimal(-0.49))).toBe('pile');
    expect(sensDeLEcart(new Decimal(0))).toBe('pile');
  });

  it('reads a margin under the rhythm and « au-dessus » over it', () => {
    expect(sensDeLEcart(new Decimal(-0.5))).toBe('marge');
    expect(sensDeLEcart(new Decimal(-68.33))).toBe('marge');
    expect(sensDeLEcart(new Decimal(0.5))).toBe('dessus');
  });
});
