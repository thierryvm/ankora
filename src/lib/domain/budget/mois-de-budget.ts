import { decalerMois, moisConcerneDe } from '@/lib/domain/accounts/mois-concerne';
import type { MovementRecord } from '@/lib/domain/accounts/operations-view';

/**
 * ADR-047 — the budget month starts when the money received « for » it lands.
 *
 * A salary « for October » that arrives on 28 September pays October: the
 * bills of October, the transfers of October, and the spending made with it
 * from that moment on. The calendar month is not the budget month for anyone
 * paid before the 1st.
 *
 * The rule is a CALCULATION over the journal, never a stored value: expenses
 * already written range themselves, and correcting the date of an income
 * ranges them again.
 *
 * - An expense belongs to the month AFTER its calendar month when a live
 *   « mon revenu du mois » (`regular`, not cancelled) for that next month
 *   arrived before it. Otherwise it belongs to its calendar month — so a month
 *   whose next income is never written falls back on the calendar, and nobody
 *   sees spending vanish for want of a noted salary.
 * - On the arrival day itself, the rule of the statements (ADR-045 D21): an
 *   expense written after the income was written is in the new month. An
 *   expense without a write time (old fixtures) is in the new month.
 * - Money received on top (`extra`) moves nothing: it is not the income of a
 *   month (ADR-046).
 * - A budget month is never earlier than the calendar month: the ±1 month
 *   constraint of ADR-046 bounds an income's month, and a LATE salary (for
 *   September, received on 2 October) does not pull October's spending back.
 *
 * Pure: no framework, no float. Days are compared as `YYYY-MM-DD` strings,
 * which sort in calendar order; `occurredOn` of a movement is a UTC midnight
 * (`src/lib/data/operations.ts`).
 */

export type RevenuDuJournal = Pick<
  MovementRecord,
  | 'kind'
  | 'occurredOn'
  | 'recordedAt'
  | 'cancelledAt'
  | 'incomeNature'
  | 'budgetYear'
  | 'budgetMonth'
>;

export type DepenseARanger = {
  /** `YYYY-MM-DD`. */
  occurredOn: string;
  /** ISO timestamp of the write. Absent: treated as written after the income. */
  createdAt?: string;
};

type Periode = { year: number; month: number };

export type FenetreDuMois = Readonly<{
  /** First day of the budget month, `YYYY-MM-DD`. */
  debut: string;
  /** Last day of the budget month, `YYYY-MM-DD`. */
  fin: string;
  /** Days from `debut` to `fin`, both included. */
  jours: number;
  /** `true` when the window is exactly the calendar month. */
  calendaire: boolean;
}>;

const iso = (p: Periode) => `${p.year}-${String(p.month).padStart(2, '0')}`;
const periode = (mois: string): Periode => {
  const [y, m] = mois.split('-').map(Number) as [number, number];
  return { year: y, month: m };
};
const jourIso = (d: Date) => d.toISOString().slice(0, 10);

/** The arrivals of the live month incomes « for » `mois`, earliest first. */
function arriveesPour(mois: string, revenus: readonly RevenuDuJournal[]): RevenuDuJournal[] {
  return revenus
    .filter(
      (r) =>
        r.kind === 'income' &&
        r.incomeNature === 'regular' &&
        r.cancelledAt === null &&
        iso(moisConcerneDe(r)) === mois,
    )
    .sort(
      (a, b) =>
        a.occurredOn.getTime() - b.occurredOn.getTime() ||
        a.recordedAt.getTime() - b.recordedAt.getTime(),
    );
}

/** Has the income of the next month arrived before this moment (day, then write time)? */
function arriveAvant(
  mois: string,
  jour: string,
  ecritLe: Date | null,
  revenus: readonly RevenuDuJournal[],
): boolean {
  return arriveesPour(mois, revenus).some((r) => {
    const arrivee = jourIso(r.occurredOn);
    if (arrivee < jour) return true;
    if (arrivee > jour) return false;
    return ecritLe === null || ecritLe.getTime() > r.recordedAt.getTime();
  });
}

function moisDuMoment(
  jour: string,
  ecritLe: Date | null,
  revenus: readonly RevenuDuJournal[],
): Periode {
  const calendrier = jour.slice(0, 7);
  const suivant = decalerMois(calendrier, 1);
  return periode(arriveAvant(suivant, jour, ecritLe, revenus) ? suivant : calendrier);
}

/** The budget month an expense belongs to. */
export function moisDeBudgetDe(
  depense: DepenseARanger,
  revenus: readonly RevenuDuJournal[],
): Periode {
  const ecritLe = depense.createdAt ? new Date(depense.createdAt) : null;
  return moisDuMoment(depense.occurredOn.slice(0, 10), ecritLe, revenus);
}

/** The expenses of budget month `ref`, in their input order. */
export function depensesDuMoisDeBudget<T extends DepenseARanger>(
  depenses: readonly T[],
  ref: Periode,
  revenus: readonly RevenuDuJournal[],
): T[] {
  const cible = iso(ref);
  return depenses.filter((d) => iso(moisDeBudgetDe(d, revenus)) === cible);
}

/** The budget month running at `now` (today in Europe/Brussels, `YYYY-MM-DD`). */
export function moisDeBudgetEnCours(
  revenus: readonly RevenuDuJournal[],
  todayIso: string,
  now: Date,
): Periode {
  return moisDuMoment(todayIso, now, revenus);
}

/**
 * Whole days from `debut` to `fin` (`YYYY-MM-DD`, UTC midnights): 0 for the
 * same day. The one place a budget month counts its days (tour 57, Reviewer
 * of tour 49: the count was written twice).
 */
export function joursEntre(debut: string, fin: string): number {
  return Math.round(
    (Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000,
  );
}

function jourSuivant(jour: string, n: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return jourIso(d);
}

/**
 * The days of budget month `ref`: from the arrival of its income when that
 * arrival is in the previous calendar month, else the 1st; to the day before
 * the arrival of the next month's income when it is within `ref`, else the
 * last day of `ref`. The arrival day belongs to the new month here — a day
 * count has no write time; the expenses of that day follow `moisDeBudgetDe`.
 */
export function fenetreDuMoisDeBudget(
  ref: Periode,
  revenus: readonly RevenuDuJournal[],
): FenetreDuMois {
  const mois = iso(ref);
  const premier = `${mois}-01`;
  const dernier = jourSuivant(`${decalerMois(mois, 1)}-01`, -1);

  const ouverture = arriveesPour(mois, revenus)
    .map((r) => jourIso(r.occurredOn))
    .find((j) => j < premier);
  const cloture = arriveesPour(decalerMois(mois, 1), revenus)
    .map((r) => jourIso(r.occurredOn))
    .find((j) => j >= premier && j <= dernier);

  const debut = ouverture ?? premier;
  const fin = cloture !== undefined && cloture > debut ? jourSuivant(cloture, -1) : dernier;
  const jours = joursEntre(debut, fin) + 1;
  return { debut, fin, jours, calendaire: debut === premier && fin === dernier };
}
