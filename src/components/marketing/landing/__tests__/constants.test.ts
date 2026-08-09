import { describe, expect, it } from 'vitest';

import deDE from '../../../../../messages/de-DE.json';
import en from '../../../../../messages/en.json';
import esES from '../../../../../messages/es-ES.json';
import frBE from '../../../../../messages/fr-BE.json';
import nlBE from '../../../../../messages/nl-BE.json';
import { HERO_WATERFALL_DEMO, RELEVE_DEMO } from '../constants';

/**
 * The landing's illustrative figures must never contradict their own
 * arithmetic — the hero card IS a subtraction shown to the visitor, so a
 * drifted constant would put a visibly false statement on the front page.
 *
 * The display strings live pre-formatted in the i18n bundles (per-locale
 * separators), so the second block checks each bundle against the numeric
 * source of truth by comparing digits only: '1 240,00 €' (fr NBSP) and
 * '1,240.00 €' (en) both reduce to '124000'.
 */

const BUNDLES = [
  ['fr-BE', frBE],
  ['en', en],
  ['nl-BE', nlBE],
  ['de-DE', deDE],
  ['es-ES', esES],
] as const;

/** Digits-only view of a pre-formatted amount ('1 240,00 €' → '124000'). */
function digits(amount: string): string {
  return amount.replace(/\D/g, '');
}

/** Expected digits for a whole-euro constant displayed with two decimals. */
function euroDigits(value: number): string {
  return `${value}00`;
}

describe('RELEVE_DEMO — the hero statement arithmetic', () => {
  it('trulyYours equals bankBalance − insurance − tax', () => {
    expect(RELEVE_DEMO.trulyYours).toBe(
      RELEVE_DEMO.bankBalance - RELEVE_DEMO.insurance - RELEVE_DEMO.tax,
    );
  });

  describe.each(BUNDLES)('%s bundle matches the numeric source of truth', (_locale, bundle) => {
    const card = bundle.landing.hero.releve.card;

    it.each([
      ['balanceAmount', card.balanceAmount, RELEVE_DEMO.bankBalance],
      ['insuranceAmount', card.insuranceAmount, RELEVE_DEMO.insurance],
      ['taxAmount', card.taxAmount, RELEVE_DEMO.tax],
      ['payoffAmount', card.payoffAmount, RELEVE_DEMO.trulyYours],
    ])('%s displays the constant', (_key, displayed, expected) => {
      expect(digits(displayed)).toBe(euroDigits(expected));
    });

    it('shows the two deductions with a leading U+2212 minus — digits() cannot see signs', () => {
      // `digits()` strips the sign, so the block above would accept a bundle
      // whose « − 280,00 € » silently became « 280,00 € » — a statement that
      // no longer subtracts anything (Sourcery, PR #339). The balance and the
      // payoff are positive by design and stay out of this list. The exact
      // fr-BE typography (NBSP placement, ordering) is pinned separately by
      // Hero.test.tsx on the rendered component.
      expect(card.insuranceAmount.startsWith('−')).toBe(true);
      expect(card.taxAmount.startsWith('−')).toBe(true);
    });
  });
});

describe('HERO_WATERFALL_DEMO — the feature cascade arithmetic (kept until L3)', () => {
  it('available equals income − expenses', () => {
    expect(HERO_WATERFALL_DEMO.available).toBe(
      HERO_WATERFALL_DEMO.income - HERO_WATERFALL_DEMO.expenses,
    );
  });

  it('provisions stays a sub-segment of expenses, never a fourth step', () => {
    expect(HERO_WATERFALL_DEMO.provisions).toBeLessThan(HERO_WATERFALL_DEMO.expenses);
  });
});
