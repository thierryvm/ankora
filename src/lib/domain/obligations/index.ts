/**
 * Obligations — the domain layer where charges and commitments finally meet.
 *
 * ## The rule the whole module exists to hold
 *
 * > An obligation lives in **one** table and counts **once in each view**. The
 * > two views are named differently:
 * >
 * > - **« À payer ce mois »** (cash) = Σ of the occurrences falling due this
 * >   month, all sources confounded.
 * > - **« Effort lissé »** (budget) = monthly charges + smoothed provisions +
 * >   commitment instalments.
 * >
 * > The same euro appears in both views — never twice in the same one.
 *
 * Three consequences, each held by a file here:
 *
 *  - `du-mois.ts` DERIVES commitment occurrences (`isDueInPeriod`), never
 *    generates rows — ADR-021's doctrine, and the reason no migration is
 *    needed;
 *  - `doublons.ts` WARNS and is read by no total;
 *  - `effort-lisse.ts` names the budget view so it cannot be mistaken for cash.
 */

export * from './types';
export * from './du-mois';
export * from './effort-lisse';
export * from './doublons';
export * from './echeances-passees';
