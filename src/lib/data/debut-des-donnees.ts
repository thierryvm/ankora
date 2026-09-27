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
 * What decision G-31 needs to know, read-only, through the SESSION client
 * (RLS applies) and scoped to the snapshot's workspace — never an id from the
 * client.
 *
 * Movements are already loaded by the cockpit (`ledger.movements`, all of
 * them, sorted by date), so only the expenses are read here: the five oldest
 * up to today, one column. Nothing is logged: a failure is thrown, like the
 * ledger's, so the page does not silently claim it is « too early ».
 */
export async function readDebutDesDonnees(
  workspaceId: string,
  todayIso: string,
  premierMouvement: string | null,
): Promise<DebutDesDonnees> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('expenses')
    .select('occurred_on')
    .eq('workspace_id', workspaceId)
    .lte('occurred_on', todayIso)
    .order('occurred_on', { ascending: true })
    .limit(DEPENSES_MIN_PROJECTION);
  if (error) throw new DataReadUnavailableError('debut-des-donnees.expenses', error);

  const premiereDepense = data?.[0]?.occurred_on?.slice(0, 10) ?? null;
  const candidats = [premiereDepense, premierMouvement].filter((d): d is string => d !== null);
  return {
    premiereOperation: candidats.length ? candidats.sort()[0]! : null,
    nbDepenses: data?.length ?? 0,
  };
}
