import { DataReadUnavailableError } from '@/lib/data/read-failure';
import { DEPENSES_MIN_PROJECTION } from '@/lib/domain/cockpit/trop-tot';
import { createClient } from '@/lib/supabase/server';

export type DebutDesDonnees = Readonly<{
  /** ISO date of the oldest operation up to today (expense or movement), or null. */
  premiereOperation: string | null;
  /**
   * Expenses recorded up to today, CAPPED at `DEPENSES_MIN_PROJECTION`: the
   * rule G-31 only asks whether the 5th expense exists, so the read stops
   * there. Every expense up to today is on or after the first operation, by
   * definition of « first ».
   */
  nbDepenses: number;
}>;

/**
 * The expenses side of decision G-31, read-only, through the SESSION client
 * (RLS applies) and scoped to the workspace it is given — which the caller
 * takes from the server-side workspace resolution, never from the client.
 *
 * Returns the ISO dates of the oldest expenses up to today, ascending, at most
 * `DEPENSES_MIN_PROJECTION` of them. Nothing is logged: a failure is thrown,
 * like the ledger's, so the page does not silently claim it is « too early ».
 *
 * Split from the combination below so the cockpit can send this read with its
 * other reads (lot P2): it needs the workspace and today, not the journal.
 */
export async function readDepensesDebut(workspaceId: string, todayIso: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('expenses')
    .select('occurred_on')
    .eq('workspace_id', workspaceId)
    .lte('occurred_on', todayIso)
    .order('occurred_on', { ascending: true })
    .limit(DEPENSES_MIN_PROJECTION);
  if (error) throw new DataReadUnavailableError('debut-des-donnees.expenses', error);
  return (data ?? []).map((row) => row.occurred_on.slice(0, 10));
}

/**
 * Pure: the first operation is the older of the first expense and the first
 * movement. Movements are already loaded by the cockpit (`ledger.movements`,
 * all of them, sorted by date), so only their first date is passed in.
 */
export function combineDebutDesDonnees(
  datesDepenses: readonly string[],
  premierMouvement: string | null,
): DebutDesDonnees {
  const premiereDepense = datesDepenses[0] ?? null;
  const candidats = [premiereDepense, premierMouvement].filter((d): d is string => d !== null);
  return {
    premiereOperation: candidats.length ? candidats.sort()[0]! : null,
    nbDepenses: datesDepenses.length,
  };
}

/** The read and the combination in sequence — what the cockpit did before lot P2. */
export async function readDebutDesDonnees(
  workspaceId: string,
  todayIso: string,
  premierMouvement: string | null,
): Promise<DebutDesDonnees> {
  return combineDebutDesDonnees(await readDepensesDebut(workspaceId, todayIso), premierMouvement);
}

/** The early read's outcome, its own failure captured rather than thrown. */
export type LectureAnticipee = { ok: true; dates: string[] } | { ok: false; error: unknown };

/**
 * What the « too early » card gets from a read started BEFORE the month's
 * situation was known (lot P2). The order of the branches is the contract:
 *
 *   1. not needed (another month, an incomplete situation) → `null`, and a
 *      failed early read is ignored: before lot P2 that read did not happen,
 *      so it could not take the cockpit down for a card that is absent;
 *   2. midnight crossed between the early read and the situation → read again,
 *      with the situation's day, whatever the early read gave — failure
 *      included: the early answer is about another day;
 *   3. the early read failed → its error is thrown, the same
 *      `DataReadUnavailableError` the sequential read threw;
 *   4. otherwise → the early dates, combined with the first movement.
 */
export async function debutDesDonneesPourLaCarte(input: {
  needed: boolean;
  /** The day the month's situation was computed for. */
  todayIso: string;
  /** The day the early read was sent with. */
  todayAtStart: string;
  early: LectureAnticipee;
  premierMouvement: string | null;
  reread: () => Promise<DebutDesDonnees>;
}): Promise<DebutDesDonnees | null> {
  if (!input.needed) return null;
  if (input.todayIso !== input.todayAtStart) return input.reread();
  if (!input.early.ok) throw input.early.error;
  return combineDebutDesDonnees(input.early.dates, input.premierMouvement);
}
