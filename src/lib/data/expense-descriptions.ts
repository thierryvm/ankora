import { createClient } from '@/lib/supabase/server';

/** How far back the description field looks. Enough for a year of daily entries. */
export const DESCRIPTION_ROWS_LIMIT = 500;

/**
 * The raw material of the description suggestions: the person's own expenses,
 * newest first, label + category + date only.
 *
 * Read with the SESSION client, never the service-role one: RLS limits the rows
 * to workspaces the caller belongs to, and the explicit `workspace_id` filter
 * narrows that to the workspace the snapshot resolved from the same session.
 * The suggestions can therefore never carry another person's descriptions.
 */
export async function getDescriptionRows(
  workspaceId: string,
): Promise<{ label: string; occurredOn: string; categoryId: string | null }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('expenses')
    .select('label, occurred_on, category_id')
    .eq('workspace_id', workspaceId)
    .order('occurred_on', { ascending: false })
    .limit(DESCRIPTION_ROWS_LIMIT);
  return (data ?? []).map((e) => ({
    label: e.label,
    occurredOn: e.occurred_on,
    categoryId: e.category_id,
  }));
}
