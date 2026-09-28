import type { Money } from '@/lib/domain/types';

import type { AccountBalanceView } from './operations-view';

/**
 * The balance a screen shows for an account, and where it comes from (rule 10).
 *
 * Tour 59 — one balance per account, everywhere: the cockpit reads the view
 * the Accounts page reads (`accountBalanceView`), never `accounts.balance`,
 * which only follows the statements and ignores every operation written since.
 *
 * - `aucun`: no statement for this account. No figure: the Accounts page says
 *   « Aucun solde pour ce compte. » and a card must not invent one.
 * - `lu`: the latest statement, plus the operations since. `operations` counts
 *   the flows that make up the gap between the two (0 = the statement alone).
 */
export type SoldeAffiche =
  | { etat: 'aucun' }
  | { etat: 'lu'; montant: Money; luLe: Date; depart: boolean; operations: number };

export function soldeAffiche(view: AccountBalanceView | null): SoldeAffiche {
  if (view === null) return { etat: 'aucun' };
  return {
    etat: 'lu',
    montant: view.computed?.balance ?? view.read.balance,
    luLe: view.read.statedOn,
    depart: view.readIsStartingBalance,
    operations: view.computed?.contributions.length ?? 0,
  };
}
