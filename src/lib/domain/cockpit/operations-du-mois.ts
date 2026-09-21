import Decimal from 'decimal.js';

import type { MovementRecord } from '@/lib/domain/accounts/operations-view';

import type { ReferencePeriod } from './types';

/**
 * PR D — what the operations journal (ADR-045) does to « Il te reste ».
 *
 * Option B, decided with @thierry on 18 September 2026:
 *
 *     Il te reste = Revenus − monthly bills − smoothed effort − instalments
 *                   − put aside − spent
 *
 * This module reads the journal and returns the four amounts the month needs.
 * It decides nothing about the figure itself: `situation-mois.ts` composes them.
 *
 * ## What counts, and what does not
 *
 * - **Put aside** (`misDeCote`) is the FREE SAVINGS part of the transfers really
 *   made for the month. The provisions part is never counted: it already left
 *   the budget as the smoothed effort, and taking it a second time would count
 *   the same euro twice. A proposal that was not transferred takes nothing —
 *   it is not in the journal.
 * - **Money received** splits by nature. `extra` is money on top of the income:
 *   it adds. `regular` is the ARRIVAL of the month's income: it replaces the
 *   written income rather than adding to it — the mock-up's rule
 *   (`contexte.js`, `revenus()`), including when the amount received differs
 *   from the written one.
 * - **Out of the main account** (`sortiesDuPrincipal`) only feeds the neutral
 *   sentence of the cascade; it changes no figure.
 * - A cancelled operation counts for nothing. A reopened one (its
 *   `cancelled_at` back to null, ADR-045 D18) counts again: nothing here
 *   remembers that it was ever cancelled.
 *
 * ## Which month
 *
 * A transfer belongs to its PLAN month when it has one — « the transfer of
 * June » can be made on 2 July. Otherwise, like every money received, it
 * belongs to the month of its date. `occurredOn` is a day read at UTC midnight
 * (`src/lib/data/operations.ts`), hence the UTC getters.
 *
 * Pure: `decimal.js` only, no float on the way (rule 1 of CLAUDE.md).
 */

export type OperationDuJournal = Pick<
  MovementRecord,
  | 'kind'
  | 'fromAccountType'
  | 'toAccountType'
  | 'amount'
  | 'occurredOn'
  | 'cancelledAt'
  | 'planYear'
  | 'planMonth'
  | 'freeSavingsPart'
  | 'incomeNature'
>;

export type OperationsDuMois = Readonly<{
  /** Sum of the `regular` money received this month; `null` when there is none. */
  revenuRecu: Decimal | null;
  /** Sum of the `extra` money received this month. */
  recuEnPlus: Decimal;
  /** Sum of the free savings parts of this month's transfers. */
  misDeCote: Decimal;
  /**
   * What left the main account (`income_bills`) by transfer this month and was
   * not already retained: a transfer to provisions for its free part only,
   * any other transfer for its whole amount. Read by the neutral sentence.
   */
  sortiesDuPrincipal: Decimal;
}>;

/** An empty journal. Frozen: a shared constant must not be mutable. */
export const AUCUNE_OPERATION: OperationsDuMois = Object.freeze({
  revenuRecu: null,
  recuEnPlus: new Decimal(0),
  misDeCote: new Decimal(0),
  sortiesDuPrincipal: new Decimal(0),
});

function estDuMois(op: OperationDuJournal, ref: ReferencePeriod): boolean {
  if (op.kind === 'transfer' && op.planYear !== null && op.planMonth !== null) {
    return op.planYear === ref.year && op.planMonth === ref.month;
  }
  return (
    op.occurredOn.getUTCFullYear() === ref.year && op.occurredOn.getUTCMonth() + 1 === ref.month
  );
}

export function operationsDuMois(
  movements: readonly OperationDuJournal[],
  ref: ReferencePeriod,
): OperationsDuMois {
  let revenuRecu: Decimal | null = null;
  let recuEnPlus = new Decimal(0);
  let misDeCote = new Decimal(0);
  let sortiesDuPrincipal = new Decimal(0);

  for (const op of movements) {
    if (op.cancelledAt !== null || !estDuMois(op, ref)) continue;

    if (op.kind === 'income') {
      if (op.incomeNature === 'extra') recuEnPlus = recuEnPlus.plus(op.amount);
      else if (op.incomeNature === 'regular')
        revenuRecu = (revenuRecu ?? new Decimal(0)).plus(op.amount);
      continue;
    }

    // A transfer. The database guarantees the free part exists exactly on a
    // transfer TO provisions (CHECK `movements_ventilation`); elsewhere it is
    // null and the transfer puts nothing aside.
    const libre = op.freeSavingsPart ?? new Decimal(0);
    misDeCote = misDeCote.plus(libre);

    if (op.fromAccountType === 'income_bills' && op.toAccountType !== 'income_bills') {
      sortiesDuPrincipal = sortiesDuPrincipal.plus(
        op.toAccountType === 'provisions' ? libre : op.amount,
      );
    }
  }

  return { revenuRecu, recuEnPlus, misDeCote, sortiesDuPrincipal };
}
