/**
 * « Trop tôt pour projeter » — decision G-31 of the mockup (contexte.js,
 * `situation().tropTot`), taken by @thierry on 17 September 2026.
 *
 * A projection drawn from one purchase is noise dressed as a figure: a single
 * expense on a brand-new workspace projected a whole month of savings. So the
 * projection, and the savings figure it feeds, wait until EITHER threshold is
 * reached — the 7th day of data or the 5th expense. Too early means both are
 * still below.
 *
 * « Days of data » count from the FIRST operation ever recorded (an expense or
 * a movement, any month), not from the first of the month: a workspace with
 * weeks of history is not « too early » on the 3rd. That case is the month's
 * own seven-day rule (`JOURS_MIN_PROJECTION`), which stays as it is.
 *
 * Dates are zone-less ISO calendar dates, compared through `Date.UTC` so no
 * local-midnight shift can move a day.
 */

/** The projection appears on the 7th day of data… */
export const JOURS_DONNEES_MIN_PROJECTION = 7;
/** …or at the 5th expense, whichever comes first. */
export const DEPENSES_MIN_PROJECTION = 5;

const JOUR_MS = 86_400_000;

function jourUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/**
 * Days of data, today included. With no operation yet, today is the first
 * day. Never below one.
 */
export function joursDeDonnees(premiereOperation: string | null, aujourdhui: string): number {
  const debut = premiereOperation ?? aujourdhui;
  const ecart = Math.round((jourUTC(aujourdhui) - jourUTC(debut)) / JOUR_MS);
  return Math.max(1, ecart + 1);
}

export type TropTotInput = Readonly<{
  /** ISO date of the oldest operation (expense or movement), or null if none. */
  premiereOperation: string | null;
  /** ISO date of today. */
  aujourdhui: string;
  /** Expenses recorded from the first operation up to today. */
  nbDepenses: number;
}>;

export function tropTotPourProjeter(input: TropTotInput): boolean {
  return (
    joursDeDonnees(input.premiereOperation, input.aujourdhui) < JOURS_DONNEES_MIN_PROJECTION &&
    input.nbDepenses < DEPENSES_MIN_PROJECTION
  );
}

/**
 * The savings figure every card of the cockpit shows. G-31 holds back the
 * projection AND the savings it feeds: a card that says « too early » while
 * another on the same screen prints a savings amount is the contradiction this
 * one function exists to prevent. Every reader goes through it.
 */
export function epargneAffichee<T>(epargne: T | null, tropTot: boolean): T | null {
  return tropTot ? null : epargne;
}
