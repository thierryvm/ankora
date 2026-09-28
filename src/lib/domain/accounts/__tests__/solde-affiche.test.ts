import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';

import { accountBalanceView, type MovementRecord } from '@/lib/domain/accounts/operations-view';
import type { AccountBalanceStatement } from '@/lib/domain/accounts/solde';
import { soldeAffiche } from '@/lib/domain/accounts/solde-affiche';

/**
 * Tour 59 — one balance per account, everywhere. The figure a card shows is
 * the one the Accounts page shows: the latest statement plus the operations
 * written since, with where it comes from (rule 10). Fictitious amounts.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const releve: AccountBalanceStatement = {
  id: 's-1',
  accountType: 'provisions',
  balance: new Decimal(705),
  statedOn: day('2026-09-01'),
  recordedAt: new Date('2026-09-01T08:00:00Z'),
  cancelledAt: null,
};

const virement = (over: Partial<MovementRecord>): MovementRecord => ({
  id: 'm-' + Math.random().toString(36).slice(2),
  kind: 'transfer',
  fromAccountType: 'income_bills',
  toAccountType: 'provisions',
  amount: new Decimal(100),
  occurredOn: day('2026-09-03'),
  recordedAt: new Date('2026-09-03T08:00:00Z'),
  cancelledAt: null,
  planYear: null,
  planMonth: null,
  planSuggestedAmount: null,
  provisionPart: null,
  freeSavingsPart: null,
  incomeNature: null,
  budgetYear: null,
  budgetMonth: null,
  description: null,
  ...over,
});

const view = (movements: MovementRecord[]) =>
  accountBalanceView({
    accountType: 'provisions',
    statements: [releve],
    movements,
    debits: [],
    today: day('2026-09-20'),
  });

describe('soldeAffiche', () => {
  it('no statement: no figure at all, never a zero passed off as a balance', () => {
    expect(soldeAffiche(null)).toEqual({ etat: 'aucun' });
  });

  it('a statement and nothing since: the read balance, zero operation', () => {
    const s = soldeAffiche(view([]));
    expect(s.etat).toBe('lu');
    if (s.etat !== 'lu') return;
    expect(s.montant.toFixed(2)).toBe('705.00');
    expect(s.operations).toBe(0);
    expect(s.luLe.toISOString().slice(0, 10)).toBe('2026-09-01');
    // The first statement of an account is its starting balance.
    expect(s.depart).toBe(true);
  });

  it('a transfer in and a transfer out since: the computed balance, with its two operations', () => {
    const s = soldeAffiche(
      view([
        virement({}),
        virement({
          fromAccountType: 'provisions',
          toAccountType: 'daily_card',
          amount: new Decimal(50),
        }),
      ]),
    );
    expect(s.etat).toBe('lu');
    if (s.etat !== 'lu') return;
    expect(s.montant.toFixed(2)).toBe('755.00');
    expect(s.operations).toBe(2);
  });
});
