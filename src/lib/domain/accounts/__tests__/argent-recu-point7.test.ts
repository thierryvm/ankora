import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import fc from 'fast-check';

import {
  argentRecuParMois,
  moisABruxelles,
  repartirArgentRecu,
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
  // Tour 64 — written at 00:30 in Brussels on 1 September (22:30 UTC on
  // 31 August, summer time): production reads September, UTC read August.
  const minuit = op({
    id: 'm',
    occurredOn: day('2026-08-31'),
    recordedAt: new Date('2026-08-31T22:30:00Z'),
  });
  // Written at 23:30 in Brussels on 31 August (21:30 UTC): still August.
  const avantMinuit = op({
    id: 'n',
    occurredOn: day('2026-08-31'),
    recordedAt: new Date('2026-08-31T21:30:00Z'),
  });

  it.each([
    [tardive, 'carte'],
    [courante, 'carte'],
    [avance, 'carte'],
    [enRetard, 'carte'],
    [ancienne, 'passe'],
    [minuit, 'carte'],
    [avantMinuit, 'passe'],
  ] as const)('line %# appears exactly once, on the %s', (m, ou) => {
    const r = repartirArgentRecu([m], '2026-09');
    const passes = r.moisPasses.flatMap((x) => x.lignes.map((l) => l.id));
    const carte = r.carte.map((x) => x.id);
    expect([...passes, ...carte]).toEqual([m.id]);
    expect(ou === 'carte' ? carte : passes).toEqual([m.id]);
  });

  it('reads the write month in Brussels, winter time too', () => {
    expect(moisABruxelles(new Date('2026-08-31T22:30:00Z'))).toBe('2026-09');
    expect(moisABruxelles(new Date('2026-08-31T21:59:59Z'))).toBe('2026-08');
    // CET (+1) on 31 December.
    expect(moisABruxelles(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01');
    expect(moisABruxelles(new Date('2026-12-31T22:59:59Z'))).toBe('2026-12');
  });
});

// Tour 64 — property: over many running months, dates, write instants (around
// midnight included) and counted-for months (none, or the date's month ±1, as
// the form allows), every line lands exactly once: card XOR past months.
describe('property: card XOR past months, never both, never nowhere', () => {
  const H = 3_600_000;
  const J = 24 * H;
  const debutDuMois = (y: number, m: number) => Date.UTC(y, m - 1, 1);

  it('holds on random ledgers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2025, max: 2028 }),
        fc.integer({ min: 1, max: 12 }),
        fc.array(
          fc.record({
            // Date: from two months before the running month to three after.
            jourDate: fc.integer({ min: -62, max: 100 }),
            // Written up to 100 days before the date (dated ahead) or 40 after,
            // at any minute; many within two hours of a midnight.
            delaiJours: fc.integer({ min: -100, max: 40 }),
            minute: fc.oneof(
              fc.integer({ min: 0, max: 24 * 60 - 1 }),
              fc.integer({ min: 22 * 60, max: 24 * 60 - 1 }),
              fc.integer({ min: 0, max: 2 * 60 }),
            ),
            compte: fc.integer({ min: -1, max: 1 }).map((d) => (d === 0 ? null : d)),
            annulee: fc.boolean(),
          }),
          { maxLength: 12 },
        ),
        fc.integer({ min: 0, max: 31 }),
        (annee, mois, specs, jourCourant) => {
          const debut = debutDuMois(annee, mois);
          const fin = debutDuMois(annee, mois + 1);
          const maintenant = Math.min(debut + jourCourant * J, fin - 1);
          // The running month is today's month in Brussels, as the page reads it.
          const courant = moisABruxelles(new Date(maintenant));
          const ops = specs.map((s, i) => {
            const date = new Date(debut + s.jourDate * J);
            const ecrit = new Date(
              Math.min(date.getTime() + s.delaiJours * J + s.minute * 60_000 - 2 * H, maintenant),
            );
            const pour =
              s.compte === null
                ? null
                : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + s.compte, 1));
            return op({
              id: `op${i}`,
              occurredOn: date,
              recordedAt: ecrit,
              cancelledAt: s.annulee ? ecrit : null,
              budgetYear: pour ? pour.getUTCFullYear() : null,
              budgetMonth: pour ? pour.getUTCMonth() + 1 : null,
            });
          });
          const r = repartirArgentRecu(ops, courant);
          const vus = [
            ...r.carte.map((m) => m.id),
            ...r.moisPasses.flatMap((x) => x.lignes.map((l) => l.id)),
          ].sort();
          expect(vus).toEqual(ops.map((m) => m.id).sort());
        },
      ),
      { numRuns: 2000 },
    );
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
