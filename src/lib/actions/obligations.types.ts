/**
 * Transport types for `obligations.ts`.
 *
 * A file carrying `'use server'` may only export `async` functions (repo rule
 * 9, enforced by `npm run lint:use-server`), so the shapes its actions return
 * live here — same split as `expense-entry.types.ts`.
 */

/** Outcome of one press of « marquer les échéances passées comme payées ». */
export type GesteGroupeResult = {
  /**
   * What the press actually did. Decided by the SERVER from the current ledger
   * — the same button ticks or unticks, and a stale client cannot choose.
   */
  mode: 'pointer' | 'depointer' | 'rien';
  charges: number;
  commitments: number;
};
