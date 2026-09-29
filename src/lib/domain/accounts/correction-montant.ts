import type Decimal from 'decimal.js';

import type { AccountType } from '@/lib/domain/cockpit/types';

import { accountBalanceView, type MovementRecord } from './operations-view';
import type { AccountBalanceStatement, AccountFlow } from './solde';
import { soldeAffiche } from './solde-affiche';

/**
 * Tour 57 — what correcting the amount of money received does to the balance
 * the person sees, so the confirmation says it truthfully (rule 10):
 *
 * - `ancre`: a statement of the account read AFTER the operation anchors the
 *   balance shown; the new amount does not move it. The day of that statement
 *   is named. When the operation sits between that statement and the one
 *   before, the GAP the card shows moves (security review, tour 57): `ecart`
 *   carries it, before and after, so the confirmation never says the gap is
 *   explained elsewhere while the correction just moved it.
 * - `change`: the operation counts after the latest statement; the balance
 *   shown moves from `avant` to `apres`.
 * - `aucunSolde`: no statement on the account, so no balance is shown.
 *
 * Measured with the very function the cards use (`accountBalanceView` then
 * `soldeAffiche`), before and after — never a second arithmetic that could
 * drift from the figure on screen.
 */
export type EffetDeLaCorrection =
  | { effet: 'ancre'; releveLe: Date; ecart: { avant: Decimal; apres: Decimal } | null }
  | { effet: 'change'; avant: Decimal; apres: Decimal }
  | { effet: 'aucunSolde' };

export function effetDeLaCorrection(input: {
  accountType: AccountType;
  statements: readonly AccountBalanceStatement[];
  movements: readonly MovementRecord[];
  debits: readonly AccountFlow[];
  today: Date;
  movementId: string;
  nouveauMontant: Decimal;
}): EffetDeLaCorrection {
  const { movementId, nouveauMontant, ...view } = input;
  if (!input.movements.some((m) => m.id === movementId)) {
    throw new RangeError('the corrected operation is not in the journal');
  }
  const corrige = input.movements.map((m) =>
    m.id === movementId ? { ...m, amount: nouveauMontant } : m,
  );
  const vueAvant = accountBalanceView(view);
  const vueApres = accountBalanceView({ ...view, movements: corrige });
  const avant = soldeAffiche(vueAvant);
  const apres = soldeAffiche(vueApres);
  if (avant.etat !== 'lu' || apres.etat !== 'lu') return { effet: 'aucunSolde' };
  if (avant.montant.equals(apres.montant)) {
    const g1 = vueAvant?.gap?.difference;
    const g2 = vueApres?.gap?.difference;
    const ecart = g1 && g2 && !g1.equals(g2) ? { avant: g1, apres: g2 } : null;
    return { effet: 'ancre', releveLe: avant.luLe, ecart };
  }
  return { effet: 'change', avant: avant.montant, apres: apres.montant };
}
