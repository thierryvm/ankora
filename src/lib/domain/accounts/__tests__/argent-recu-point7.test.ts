import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';

import {
  argentRecuHorsCarte,
  argentRecuParMois,
  surLaCarteDuMois,
} from '@/lib/domain/accounts/argent-recu-par-mois';
import { effetDeLaCorrection } from '@/lib/domain/accounts/correction-montant';
import type { MovementRecord } from '@/lib/domain/accounts/operations-view';
import type { AccountBalanceStatement } from '@/lib/domain/accounts/solde';

/**
 * Tour 58, point 7 — the rests of tour 57 (money received). Fictitious
 * amounts only (505 / 705).
 */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const op = (over: Partial<MovementRecord> & { id: string }): MovementRecord => ({
  kind: 'income',
  fromAccountType: null,
  toAccountType: 'income_bills',
  amount: new Decimal(505),
  occurredOn: day('2026-08-03'),
  recordedAt: day('2026-08-03'),
  cancelledAt: null,
  planYear: null,
  planMonth: null,
  planSuggestedAmount: null,
  provisionPart: null,
  freeSavingsPart: null,
  incomeNature: 'regular',
  budgetYear: null,
  budgetMonth: null,
  description: null,
  ...over,
});

describe('a past month counts what it sums', () => {
  it('the number of operations excludes cancelled lines, like the total', () => {
    const [aout] = argentRecuParMois(
      [op({ id: 'a' }), op({ id: 'b', amount: new Decimal(200), cancelledAt: day('2026-08-04') })],
      '2026-09',
    );
    expect(aout!.total.toString()).toBe('505');
    expect(aout!.nombre).toBe(1);
    expect(aout!.lignes).toHaveLength(2);
  });
});

describe('a line is on the card of the month OR in the past months, never both', () => {
  // Dated in August, counted for August, but written on 2 September.
  const tardive = op({ id: 't', occurredOn: day('2026-08-31'), recordedAt: day('2026-09-02') });
  const courante = op({ id: 'c', occurredOn: day('2026-09-02'), recordedAt: day('2026-09-02') });
  // Received on 28 September FOR October: the card of September keeps it.
  const avance = op({
    id: 'v',
    occurredOn: day('2026-09-28'),
    recordedAt: day('2026-09-28'),
    budgetYear: 2026,
    budgetMonth: 10,
  });

  // A late salary typed on 2 September FOR August (relecture tour 58 bis):
  // it stays on the card where it was typed, cancellable there (rule 11).
  const enRetard = op({
    id: 'r',
    occurredOn: day('2026-09-02'),
    recordedAt: day('2026-09-02'),
    budgetYear: 2026,
    budgetMonth: 8,
  });
  // Dated, counted and written in August: the past months only.
  const ancienne = op({ id: 'o', occurredOn: day('2026-08-10'), recordedAt: day('2026-08-10') });
  const moisEcrit = (m: MovementRecord) => m.recordedAt.toISOString().slice(0, 7);

  it.each([
    [tardive, 'carte'],
    [courante, 'carte'],
    [avance, 'carte'],
    [enRetard, 'carte'],
    [ancienne, 'passe'],
  ] as const)('line %# appears exactly once, on the %s', (m, ou) => {
    const passes = argentRecuHorsCarte([m], '2026-09', moisEcrit).flatMap((x) =>
      x.lignes.map((l) => l.id),
    );
    const carte = surLaCarteDuMois(m, '2026-09', moisEcrit(m)) ? [m.id] : [];
    expect([...passes, ...carte]).toEqual([m.id]);
    expect(ou === 'carte' ? carte : passes).toEqual([m.id]);
  });
});

describe('the correction message never calls the starting balance a statement', () => {
  const statement = (id: string, statedOn: string): AccountBalanceStatement => ({
    id,
    accountType: 'income_bills',
    balance: new Decimal(705),
    statedOn: day(statedOn),
    recordedAt: new Date(`${statedOn}T08:00:00Z`),
    cancelledAt: null,
    includedFlowIds: [],
  });
  const avantLeDepart = op({
    id: 'x',
    occurredOn: day('2026-09-05'),
    recordedAt: day('2026-09-05'),
  });

  it('anchored on the starting balance → depart: true', () => {
    const effet = effetDeLaCorrection({
      accountType: 'income_bills',
      statements: [statement('s0', '2026-09-10')],
      movements: [avantLeDepart],
      debits: [],
      today: day('2026-09-20'),
      movementId: 'x',
      nouveauMontant: new Decimal(500),
    });
    expect(effet).toMatchObject({ effet: 'ancre', depart: true });
  });

  it('anchored on a statement read later → depart: false', () => {
    const effet = effetDeLaCorrection({
      accountType: 'income_bills',
      statements: [statement('s0', '2026-09-01'), statement('s1', '2026-09-10')],
      movements: [avantLeDepart],
      debits: [],
      today: day('2026-09-20'),
      movementId: 'x',
      nouveauMontant: new Decimal(500),
    });
    expect(effet).toMatchObject({ effet: 'ancre', depart: false });
  });
});
