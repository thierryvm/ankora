import type { createClient } from '@/lib/supabase/server';
import { isCategoryKindAllowedFor, type CategoryUse } from '@/lib/domain/categories/category-use';

/**
 * The check every Server Action runs before writing a client-supplied
 * `category_id`.
 *
 * ## No `'use server'` here, on purpose
 *
 * Same reason as `authorized-workspace.ts`: this is infrastructure called BY
 * Server Actions. Exposing it as a POST endpoint would publish the check itself
 * (rule 9 of `CLAUDE.md`, enforced by `npm run lint:use-server`).
 *
 * ## Why row-level security is not enough
 *
 * RLS scopes the row being written by ITS `workspace_id`. It says nothing about
 * the category that row points to. And a category readable under RLS is not
 * necessarily one of the session's workspace — a member of two workspaces sees
 * both. So the read is filtered on the SESSION's workspace explicitly, never on
 * visibility.
 *
 * ## One answer for every refusal
 *
 * The caller maps `false` to the generic validation error. A category that
 * belongs to someone else, one that does not exist, one of the wrong kind, and
 * a failed read are indistinguishable from outside: the answer must not reveal
 * whether an id exists elsewhere. A failed read refuses (fail closed).
 *
 * @param supabase     the SESSION client (never the service role: RLS is the
 *                     first filter, the workspace equality the second).
 * @param workspaceId  the workspace resolved from the session, never from input.
 * @param categoryId   `null` / `undefined` mean « no category written »: nothing
 *                     to check.
 */
export async function isCategoryWritable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  categoryId: string | null | undefined,
  use: CategoryUse,
): Promise<boolean> {
  if (categoryId === null || categoryId === undefined) return true;

  const { data, error } = await supabase
    .from('categories')
    .select('kind')
    .eq('id', categoryId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error || !data) return false;
  return isCategoryKindAllowedFor(use, data.kind);
}
