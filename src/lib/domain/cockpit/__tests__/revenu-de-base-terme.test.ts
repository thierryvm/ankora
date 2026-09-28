import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { revenuDeBaseEstLePrevu } from '@/lib/domain/cockpit/situation-mois';

// Issue #504 — the word before the base income says what the AMOUNT is. The
// base is the greater of the written income and the regular money received
// (issue #483): while the written income wins, the amount was not received.
describe('revenuDeBaseEstLePrevu', () => {
  const d = (n: number) => new Decimal(n);

  it('nothing received yet: the amount is the written income', () => {
    expect(revenuDeBaseEstLePrevu({ revenuEcrit: d(2505), revenuRecu: null })).toBe(true);
  });

  it('part received, below the written income: still the written income', () => {
    expect(revenuDeBaseEstLePrevu({ revenuEcrit: d(2505), revenuRecu: d(705) })).toBe(true);
  });

  it('received equals the written income: the amount was received', () => {
    expect(revenuDeBaseEstLePrevu({ revenuEcrit: d(2505), revenuRecu: d(2505) })).toBe(false);
  });

  it('received above the written income: the amount is the money received', () => {
    expect(revenuDeBaseEstLePrevu({ revenuEcrit: d(505), revenuRecu: d(705) })).toBe(false);
  });

  it('no written income: nothing is planned, so never « Revenu prévu »', () => {
    expect(revenuDeBaseEstLePrevu({ revenuEcrit: null, revenuRecu: d(705) })).toBe(false);
    expect(revenuDeBaseEstLePrevu({ revenuEcrit: null, revenuRecu: null })).toBe(false);
  });
});
