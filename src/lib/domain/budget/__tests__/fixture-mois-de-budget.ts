import { money, type Expense } from '@/lib/domain/types';

import type { RevenuDuJournal } from '../mois-de-budget';

/**
 * ADR-047 — ONE fixture every reader of « the expenses of the month » is
 * checked against. Fictitious amounts (public repository).
 *
 * The salary « for October » lands on 28 September and is written at 18:00 UTC.
 * September's budget = 40 + 15 = 55; October's = 25 + 30 + 10 = 65.
 */
export const SEPTEMBRE = { year: 2026, month: 9 } as const;
export const OCTOBRE = { year: 2026, month: 10 } as const;

export const SALAIRE_OCTOBRE: RevenuDuJournal = {
  kind: 'income',
  occurredOn: new Date('2026-09-28T00:00:00Z'),
  recordedAt: new Date('2026-09-28T18:00:00Z'),
  cancelledAt: null,
  incomeNature: 'regular',
  budgetYear: 2026,
  budgetMonth: 10,
};

const depense = (id: string, occurredOn: string, amount: number, createdAt?: string): Expense => ({
  id,
  label: 'Courses',
  amount: money(amount),
  occurredOn,
  categoryId: null,
  note: null,
  paidFrom: 'vie_courante',
  ...(createdAt ? { createdAt } : {}),
});

export const DEPENSES: Expense[] = [
  depense('e-20-sept', '2026-09-20', 40),
  depense('e-28-matin', '2026-09-28', 15, '2026-09-28T09:00:00Z'),
  depense('e-28-soir', '2026-09-28', 25, '2026-09-28T20:00:00Z'),
  depense('e-29-sept', '2026-09-29', 30),
  depense('e-3-oct', '2026-10-03', 10),
];

export const IDS_SEPTEMBRE = ['e-20-sept', 'e-28-matin'];
export const IDS_OCTOBRE = ['e-28-soir', 'e-29-sept', 'e-3-oct'];
