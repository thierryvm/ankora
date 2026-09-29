import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';

import { effetDeLaCorrection } from '@/lib/domain/accounts/correction-montant';
import { accountBalanceView, type MovementRecord } from '@/lib/domain/accounts/operations-view';
import type { AccountBalanceStatement } from '@/lib/domain/accounts/solde';
import { soldeAffiche } from '@/lib/domain/accounts/solde-affiche';

/**
 * Tour 57 — correcting the amount of money received. What the person is told
 * must be true: when a statement of the account was read after the operation,
 * the balance shown is anchored on it and does not move; otherwise the
 * computed balance moves by the difference. Fictitious amounts.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const releve = (statedOn: string, balance = 705): AccountBalanceStatement => ({
  id: `s-${statedOn}`,
  accountType: 'income_bills',
  balance: new Decimal(balance),
  statedOn: day(statedOn),
  recordedAt: new Date(`${statedOn}T08:00:00Z`),
  cancelledAt: null,
});

const recu: MovementRecord = {
  id: 'm-recu',
  kind: 'income',
  fromAccountType: null,
  toAccountType: 'income_bills',
  amount: new Decimal(505),
  occurredOn: day('2026-09-10'),
  recordedAt: new Date('2026-09-10T09:00:00Z'),
  cancelledAt: null,
  planYear: null,
  planMonth: null,
  planSuggestedAmount: null,
  provisionPart: null,
  freeSavingsPart: null,
  incomeNature: 'regular',
  budgetYear: null,
  budgetMonth: null,
  description: 'Revenu du mois',
};

const base = {
  accountType: 'income_bills' as const,
  movements: [recu],
  debits: [],
  today: day('2026-09-20'),
  movementId: 'm-recu',
};

describe('effetDeLaCorrection', () => {
  it('a statement read after the operation: the balance shown does not move, and its day is named', () => {
    const statements = [releve('2026-09-01', 100), releve('2026-09-15')];
    const effet = effetDeLaCorrection({ ...base, statements, nouveauMontant: new Decimal(550) });
    expect(effet.effet).toBe('ancre');
    // Between the two statements: the gap of the card moves (read 705, expected
    // 100 + 505 = 605 → 650): 100 → 55. The confirmation must say so.
    if (effet.effet === 'ancre') {
      expect(effet.releveLe).toEqual(day('2026-09-15'));
      expect(effet.ecart?.avant.toFixed(2)).toBe('100.00');
      expect(effet.ecart?.apres.toFixed(2)).toBe('55.00');
    }

    // The very figure the card shows, before and after the new amount.
    const shown = (m: MovementRecord[]) =>
      soldeAffiche(accountBalanceView({ ...base, statements, movements: m }));
    const avant = shown([recu]);
    const apres = shown([{ ...recu, amount: new Decimal(550) }]);
    expect(avant.etat === 'lu' && apres.etat === 'lu').toBe(true);
    if (avant.etat === 'lu' && apres.etat === 'lu') {
      expect(apres.montant.toFixed(2)).toBe(avant.montant.toFixed(2));
    }
  });

  it('no statement after it: the computed balance moves by the difference, from X to Y', () => {
    const effet = effetDeLaCorrection({
      ...base,
      statements: [releve('2026-09-01', 100)],
      nouveauMontant: new Decimal(550),
    });
    expect(effet.effet).toBe('change');
    if (effet.effet === 'change') {
      expect(effet.avant.toFixed(2)).toBe('605.00');
      expect(effet.apres.toFixed(2)).toBe('650.00');
    }
  });

  it('no statement on the account at all: no balance is shown, none is announced', () => {
    expect(
      effetDeLaCorrection({ ...base, statements: [], nouveauMontant: new Decimal(550) }),
    ).toEqual({ effet: 'aucunSolde' });
  });

  it('refuses to guess on an operation that is not in the journal', () => {
    expect(() =>
      effetDeLaCorrection({
        ...base,
        movementId: 'absent',
        statements: [releve('2026-09-01')],
        nouveauMontant: new Decimal(1),
      }),
    ).toThrow(RangeError);
  });

  it('a statement after it and none between: anchored, and no gap moves', () => {
    const effet = effetDeLaCorrection({
      ...base,
      statements: [releve('2026-09-15')],
      nouveauMontant: new Decimal(550),
    });
    // The only statement of the account is its starting balance (tour 58).
    expect(effet).toEqual({
      effet: 'ancre',
      releveLe: day('2026-09-15'),
      depart: true,
      ecart: null,
    });
  });
});
