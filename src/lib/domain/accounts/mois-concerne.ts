/**
 * Tour 42 — the month an income counts for (ADR-046).
 *
 * A salary received on 28 September pays October's bills. The row keeps TWO
 * readings, never mixed:
 *
 * - its DATE moves the balance of the account that received it — that money
 *   is really there from that day (`operations-view.ts`, untouched);
 * - its MONTH (the assignment, or the month of the date without one) is the
 *   budget it feeds (`cockpit/operations-du-mois.ts`).
 *
 * The proposal made at entry is never read from a fixed day of the month: the
 * salary lands on the 26th, the 30th, or the 2nd of the next month. It is read
 * from the last month already served by a « mon revenu du mois ».
 *
 * Pure: no framework, no float. Months travel as `YYYY-MM` strings, which sort
 * in calendar order.
 */

export type MoisIso = string;

type Periode = { year: number; month: number };

type Rentree = {
  kind: 'transfer' | 'income';
  occurredOn: Date;
  cancelledAt: Date | null;
  incomeNature: 'regular' | 'extra' | null;
  budgetYear: number | null;
  budgetMonth: number | null;
};

const versIso = (p: Periode): MoisIso => `${p.year}-${String(p.month).padStart(2, '0')}`;

/** `YYYY-MM-DD` → `YYYY-MM`. */
export function moisDeLaDate(dateIso: string): MoisIso {
  return dateIso.slice(0, 7);
}

/** Shift a `YYYY-MM` month by `n` months, across years. */
export function decalerMois(mois: MoisIso, n: number): MoisIso {
  const [y, m] = mois.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return versIso({ year: Math.floor(total / 12), month: (total % 12) + 1 });
}

/** The month whose budget an operation feeds: its assignment, else the month of its date (UTC day). */
export function moisConcerneDe(
  op: Pick<Rentree, 'occurredOn' | 'budgetYear' | 'budgetMonth'>,
): Periode {
  if (op.budgetYear !== null && op.budgetMonth !== null) {
    return { year: op.budgetYear, month: op.budgetMonth };
  }
  return { year: op.occurredOn.getUTCFullYear(), month: op.occurredOn.getUTCMonth() + 1 };
}

/** The months already served by a live « mon revenu du mois », sorted, without duplicates. */
export function moisServisParRevenu(movements: readonly Rentree[]): MoisIso[] {
  const servis = new Set<MoisIso>();
  for (const op of movements) {
    if (op.kind !== 'income' || op.incomeNature !== 'regular' || op.cancelledAt !== null) continue;
    servis.add(versIso(moisConcerneDe(op)));
  }
  return [...servis].sort();
}

/** Days at the end of a month in which a month income is proposed for the next month. */
export const DERNIERS_JOURS_DU_MOIS = 10;

function dansLesDerniersJours(dateIso: string): boolean {
  const [y, m, d] = dateIso.split('-').map(Number) as [number, number, number];
  const joursDuMois = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d > joursDuMois - DERNIERS_JOURS_DU_MOIS;
}

/**
 * The month proposed for money received on `dateIso`.
 *
 * - on top of the income (`extra`) → the month of the date;
 * - the month's income (`regular`):
 *   - in the last ten days of the month, when the month of the date is already
 *     served → the next month (the salary of the 28th pays the next month);
 *   - a late salary (the month before the date follows the last one served)
 *     → that previous month;
 *   - otherwise → the month of the date.
 *
 * Tour 57 — two salaries in one household: the partner's salary of the 5th
 * belongs to the running month, never to the next one. The person can always
 * choose another month at entry (`choixDeMois`).
 */
export function moisProposePourArgentRecu(input: {
  dateIso: string;
  nature: 'regular' | 'extra';
  moisServis: readonly MoisIso[];
}): MoisIso {
  const moisDate = moisDeLaDate(input.dateIso);
  if (input.nature === 'extra' || input.moisServis.length === 0) return moisDate;
  if (dansLesDerniersJours(input.dateIso) && input.moisServis.includes(moisDate)) {
    return decalerMois(moisDate, 1);
  }
  const dernier = [...input.moisServis].sort().at(-1)!;
  const precedent = decalerMois(moisDate, -1);
  return decalerMois(dernier, 1) === precedent ? precedent : moisDate;
}

/**
 * The months offered at entry: the month of the date and the next one; the
 * previous one in front only when it is the proposal (the late salary).
 */
export function choixDeMois(input: { dateIso: string; propose: MoisIso }): MoisIso[] {
  const moisDate = moisDeLaDate(input.dateIso);
  const base = [moisDate, decalerMois(moisDate, 1)];
  return input.propose === decalerMois(moisDate, -1) ? [input.propose, ...base] : base;
}
