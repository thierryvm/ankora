import { describe, expect, it } from 'vitest';

import {
  validateTransferAllocation,
  type TransferAllocationInput,
} from '@/lib/domain/accounts/virement';
import { money } from '@/lib/domain/types';

// Invented figures only — this repository is public.

function allocation(over: Partial<TransferAllocationInput> = {}): TransferAllocationInput {
  return {
    toAccountType: 'provisions',
    amount: money(275),
    provisionPart: money(200),
    freeSavingsPart: money(75),
    ...over,
  };
}

describe('validateTransferAllocation — vers les provisions', () => {
  it('accepts a split whose parts sum exactly to the amount', () => {
    const result = validateTransferAllocation(allocation());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.provisionPart?.toString()).toBe('200');
    expect(result.freeSavingsPart?.toString()).toBe('75');
    expect(result.amount.toString()).toBe('275');
  });

  it('accepts a split down to the cent', () => {
    const result = validateTransferAllocation(
      allocation({
        amount: money(275.45),
        provisionPart: money(200.2),
        freeSavingsPart: money(75.25),
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a zero part — all smoothing, or all free savings', () => {
    expect(
      validateTransferAllocation(
        allocation({ provisionPart: money(0), freeSavingsPart: money(275) }),
      ).ok,
    ).toBe(true);
    expect(
      validateTransferAllocation(
        allocation({ provisionPart: money(275), freeSavingsPart: money(0) }),
      ).ok,
    ).toBe(true);
  });

  // ADR-038 D4: « l'écart est refusé, pas arrondi ». One cent is an écart.
  it('REFUSES a one-cent shortfall instead of rounding it away', () => {
    const result = validateTransferAllocation(
      allocation({ amount: money(275), provisionPart: money(200), freeSavingsPart: money(74.99) }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('sum-mismatch');
  });

  it('REFUSES a one-cent excess', () => {
    const result = validateTransferAllocation(
      allocation({ amount: money(275), provisionPart: money(200), freeSavingsPart: money(75.01) }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('sum-mismatch');
  });

  // Rule 10: the refusal says by HOW MUCH, so a screen can say it too.
  it('says how far off the split is, and in which direction', () => {
    const short = validateTransferAllocation(
      allocation({ amount: money(275), provisionPart: money(200), freeSavingsPart: money(60) }),
    );
    if (short.ok) throw new Error('unreachable');
    expect(short.reason).toBe('sum-mismatch');
    expect(short.allocated.toString()).toBe('260');
    expect(short.expected.toString()).toBe('275');
    expect(short.difference.toString()).toBe('-15');

    const over = validateTransferAllocation(
      allocation({ amount: money(275), provisionPart: money(200), freeSavingsPart: money(90) }),
    );
    if (over.ok) throw new Error('unreachable');
    expect(over.difference.toString()).toBe('15');
  });

  it.each([
    ['provisionPart', allocation({ provisionPart: money(-10), freeSavingsPart: money(285) })],
    ['freeSavingsPart', allocation({ provisionPart: money(285), freeSavingsPart: money(-10) })],
  ])('REFUSES a negative %s, even when the two still sum right', (_label, input) => {
    const result = validateTransferAllocation(input);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('negative-part');
  });

  it.each([
    ['provisionPart', allocation({ provisionPart: null })],
    ['freeSavingsPart', allocation({ freeSavingsPart: null })],
    ['both', allocation({ provisionPart: null, freeSavingsPart: null })],
  ])('REFUSES a transfer to provisions with %s missing', (_label, input) => {
    const result = validateTransferAllocation(input);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('allocation-required');
  });
});

describe('validateTransferAllocation — hors provisions', () => {
  it.each(['income_bills', 'daily_card'] as const)(
    'accepts a transfer to %s with no split at all',
    (target) => {
      const result = validateTransferAllocation({
        toAccountType: target,
        amount: money(275),
        provisionPart: null,
        freeSavingsPart: null,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('unreachable');
      expect(result.provisionPart).toBeNull();
      expect(result.freeSavingsPart).toBeNull();
    },
  );

  it.each([
    ['provisionPart', { provisionPart: money(275), freeSavingsPart: null }],
    ['freeSavingsPart', { provisionPart: null, freeSavingsPart: money(275) }],
    ['both', { provisionPart: money(200), freeSavingsPart: money(75) }],
  ])('REFUSES a split towards daily_card — %s given', (_label, parts) => {
    const result = validateTransferAllocation({
      toAccountType: 'daily_card',
      amount: money(275),
      ...parts,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('allocation-forbidden');
  });
});

describe('validateTransferAllocation — le montant lui-même', () => {
  it.each([0, -275])('REFUSES an amount of %d', (bogus) => {
    const result = validateTransferAllocation(allocation({ amount: money(bogus) }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('non-positive-amount');
  });

  // The amount is checked BEFORE the split: a refusal naming the split would
  // send the person to correct the wrong field.
  it('names the amount, not the split, when both are wrong', () => {
    const result = validateTransferAllocation(
      allocation({ amount: money(0), provisionPart: money(-1), freeSavingsPart: money(1) }),
    );
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('non-positive-amount');
  });
});
