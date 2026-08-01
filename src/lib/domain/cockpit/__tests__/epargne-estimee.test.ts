import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

import { epargneEstimee, JOURS_MIN_PROJECTION } from '@/lib/domain/cockpit/epargne-estimee';

const input = (over: Partial<Parameters<typeof epargneEstimee>[0]> = {}) => ({
  budgetDuMois: new Decimal(736.79),
  depensesDuMois: new Decimal(288.4),
  joursEcoules: 18,
  joursDuMois: 31,
  ...over,
});

describe('epargneEstimee', () => {
  it('projects the current pace to the end of the month', () => {
    // 288.40 × 31 / 18 = 496.69 of projected spending → 736.79 − 496.69 = 240.10
    const out = epargneEstimee(input());
    expect(out).not.toBeNull();
    expect(out!.toDecimalPlaces(2).toNumber()).toBe(240.1);
  });

  it('returns null before the 7th day — a projection from two days is noise', () => {
    expect(epargneEstimee(input({ joursEcoules: 1 }))).toBeNull();
    expect(epargneEstimee(input({ joursEcoules: JOURS_MIN_PROJECTION - 1 }))).toBeNull();
  });

  it('starts projecting exactly on the 7th day', () => {
    expect(epargneEstimee(input({ joursEcoules: JOURS_MIN_PROJECTION }))).not.toBeNull();
  });

  it('null is not zero — "no estimate yet" is a different claim about money', () => {
    // Guards against a refactor collapsing the two into `new Decimal(0)`, which
    // would tell the user they will save nothing rather than that it is early.
    const early = epargneEstimee(input({ joursEcoules: 2 }));
    expect(early).toBeNull();
    expect(early).not.toEqual(new Decimal(0));
  });

  it('goes negative when the pace overspends the month, without clamping', () => {
    // Spending 600 in 10 days of a 30-day month projects 1800 against a 700
    // budget. The negative is the signal; hiding it would be the bug.
    const out = epargneEstimee(
      input({
        budgetDuMois: new Decimal(700),
        depensesDuMois: new Decimal(600),
        joursEcoules: 10,
        joursDuMois: 30,
      }),
    );
    expect(out!.toNumber()).toBe(-1100);
  });

  it('equals the untouched budget when nothing has been spent', () => {
    const out = epargneEstimee(input({ depensesDuMois: new Decimal(0) }));
    expect(out!.toNumber()).toBe(736.79);
  });

  it('on the last day of the month, the projection is simply what was spent', () => {
    const out = epargneEstimee(
      input({
        budgetDuMois: new Decimal(1000),
        depensesDuMois: new Decimal(400),
        joursEcoules: 30,
        joursDuMois: 30,
      }),
    );
    expect(out!.toNumber()).toBe(600);
  });

  it('returns null on a non-finite or non-positive month length', () => {
    expect(epargneEstimee(input({ joursDuMois: 0 }))).toBeNull();
    expect(epargneEstimee(input({ joursEcoules: Number.NaN }))).toBeNull();
  });

  it('keeps Decimal arithmetic — no float drift on thirds', () => {
    // 100 × 30 / 3 is exact in Decimal; in float, 0.1-style inputs drift.
    const out = epargneEstimee({
      budgetDuMois: new Decimal('0.3'),
      depensesDuMois: new Decimal('0.1'),
      joursEcoules: 30,
      joursDuMois: 30,
    });
    expect(out!.toString()).toBe('0.2');
  });
});
