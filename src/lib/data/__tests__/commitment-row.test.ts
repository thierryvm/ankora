import { describe, expect, it } from 'vitest';

import { hasLiveCommitments, type CommitmentRow } from '@/lib/data/commitment-row';

/** Car loan: 4 200 € over 17 monthly instalments of 250 €, anchored Jan 2026. */
const carLoan: CommitmentRow = {
  id: 'car',
  label: 'Crédit voiture',
  kind: 'debt',
  totalAmount: 4200,
  installmentAmount: 250,
  installmentsTotal: 17,
  startYear: 2026,
  startMonth: 1,
  paymentDay: 15,
  frequency: 'monthly',
  notes: null,
  isActive: true,
};

/** Ledger keys for a fully-settled 17-instalment monthly commitment. */
const allTicked = Array.from(
  { length: 17 },
  (_, i) => `${2026 + Math.floor(i / 12)}-${(i % 12) + 1}`,
);

describe('hasLiveCommitments', () => {
  it('is false with no commitments', () => {
    expect(hasLiveCommitments([], {})).toBe(false);
  });

  it('is true when an active commitment is not fully settled', () => {
    expect(hasLiveCommitments([carLoan], { car: ['2026-1'] })).toBe(true);
  });

  it('is false once every instalment is ticked (settled)', () => {
    expect(hasLiveCommitments([carLoan], { car: allTicked })).toBe(false);
  });

  it('is false for an inactive commitment', () => {
    expect(hasLiveCommitments([{ ...carLoan, isActive: false }], {})).toBe(false);
  });

  it('is true when at least one of several is still live', () => {
    const settled: CommitmentRow = { ...carLoan, id: 'done', installmentsTotal: 2 };
    expect(hasLiveCommitments([settled, carLoan], { done: ['2026-1', '2026-2'], car: [] })).toBe(
      true,
    );
  });

  it('treats a missing ledger entry as fully unpaid (live)', () => {
    expect(hasLiveCommitments([carLoan], {})).toBe(true);
  });
});
