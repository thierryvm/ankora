/**
 * Tour 57 — what « Corriger le montant » did to the balance on screen, so the
 * confirmation says it truthfully. Lives outside the 'use server' file, which
 * may export only async functions (rule 9).
 *
 * - `ancre`: a statement read after the operation anchors the balance; it
 *   does not move (`releveLe`, `YYYY-MM-DD`, names that statement).
 * - `change`: the balance shown goes from `avant` to `apres`.
 * - `aucunSolde`: the account has no statement, so no balance is shown.
 * - `identique`: the same amount was sent again; nothing was written.
 */
export type IncomeCorrectionEffect =
  | { effet: 'ancre'; releveLe: string }
  | { effet: 'change'; avant: number; apres: number }
  | { effet: 'aucunSolde' }
  | { effet: 'identique' };
