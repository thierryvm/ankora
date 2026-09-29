import Decimal from 'decimal.js';

import type { AccountType } from '@/lib/domain/cockpit/types';

import { moisConcerneDe, type MoisIso } from './mois-concerne';
import type { MovementRecord } from './operations-view';

/**
 * Tour 57 — « chaque centime doit pouvoir être retrouvé ». The money received
 * of the budget months BEFORE `avant` (the running month stays on the cards of
 * the accounts), month by month, the most recent first.
 *
 * An income is ranged by the month it COUNTS for (its assignment, else the
 * month of its date — ADR-046), the same reading as the cockpit. Each month's
 * total is the sum of its standing lines, and it travels WITH those lines
 * (rule 10): a cancelled line is listed — it can be restored — never counted.
 *
 * Pure: no framework, no float.
 */

export type LigneArgentRecu = {
  id: string;
  accountType: AccountType;
  amount: Decimal;
  occurredOn: Date;
  description: string | null;
  cancelled: boolean;
  /** The month it counts for, only when the date does not already say it. */
  countsFor: MoisIso | null;
};

export type MoisArgentRecu = {
  mois: MoisIso;
  total: Decimal;
  lignes: LigneArgentRecu[];
};

const iso = (p: { year: number; month: number }) => `${p.year}-${String(p.month).padStart(2, '0')}`;

export function argentRecuParMois(
  movements: readonly MovementRecord[],
  avant: MoisIso,
): MoisArgentRecu[] {
  const parMois = new Map<MoisIso, MovementRecord[]>();
  for (const m of movements) {
    if (m.kind !== 'income' || m.toAccountType === null) continue;
    const mois = iso(moisConcerneDe(m));
    if (mois >= avant) continue;
    parMois.set(mois, [...(parMois.get(mois) ?? []), m]);
  }

  return [...parMois.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([mois, ops]) => {
      const lignes = [...ops]
        .sort(
          (a, b) =>
            b.occurredOn.getTime() - a.occurredOn.getTime() ||
            b.recordedAt.getTime() - a.recordedAt.getTime(),
        )
        .map((m): LigneArgentRecu => ({
          id: m.id,
          accountType: m.toAccountType!,
          amount: m.amount,
          occurredOn: m.occurredOn,
          description: m.description,
          cancelled: m.cancelledAt !== null,
          countsFor: m.budgetYear !== null && m.budgetMonth !== null ? mois : null,
        }));
      const total = lignes
        .filter((l) => !l.cancelled)
        .reduce((s, l) => s.plus(l.amount), new Decimal(0));
      return { mois, total, lignes };
    });
}
