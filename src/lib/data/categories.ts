import { log } from '@/lib/log';
import { createClient } from '@/lib/supabase/server';
import {
  CATEGORY_COLOR_TOKENS,
  CATEGORY_KINDS,
  type Category,
  type CategoryColorToken,
  type CategoryKind,
} from '@/lib/domain/categories';

/**
 * Read the workspace's categories.
 *
 * The table has existed since the initial schema and 8 rows are seeded at every
 * signup, but until chantier 2 **nothing read it** — `grep -rn categor src/`
 * returned mappings and a hardcoded `categoryId: null`, never a SELECT. So
 * `expenses.category_id` was written as null on every insert while the column,
 * its foreign key and an Accepted ADR (ADR-022) all sat waiting.
 *
 * Ordered by `created_at`: the seed inserts in a deliberate order, and
 * `rankExpenseCategories` uses declaration order as its final tie-break. A
 * name-alphabetical order here would make the tie-break arbitrary in a way the
 * user would read as "the chips moved on their own".
 */
export async function getCategories(workspaceId: string): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('categories')
    // Explicit column list, not `select('*')`: unlike `charges` (incident
    // 2026-07-18, where naming a not-yet-migrated column blanked the whole
    // dashboard), every column named here has existed since
    // `20260503000003`. `category_group` from `20260729000002` is deliberately
    // NOT selected — the picker does not need it, and naming an unapplied
    // column is exactly what caused that incident.
    .select('id, name, kind, color_token, is_system')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (error) {
    // Never a silent `?? []`. An empty category list and a failed read look
    // identical to the user — an entry sheet with no chips — and only one of
    // them is a bug. Same lesson as the charges read above.
    log.error('Failed to load categories', {
      workspace_id: workspaceId,
      error_code: error.code ?? 'unknown',
    });
    return [];
  }

  return (data ?? []).flatMap((row) => {
    // The DB `check` constraints already restrict both columns, but the
    // generated types widen them to `string`. Validate rather than cast: a row
    // with an unknown colour token would otherwise reach Tailwind as a class
    // that does not exist and render an invisible chip.
    const kind = CATEGORY_KINDS.find((k) => k === row.kind);
    const colorToken = CATEGORY_COLOR_TOKENS.find((t) => t === row.color_token);
    if (!kind) {
      log.warn('Category with an unknown kind, skipped', { category_id: row.id });
      return [];
    }
    return [
      {
        id: row.id,
        name: row.name,
        kind: kind satisfies CategoryKind,
        colorToken: (colorToken ?? 'zinc') satisfies CategoryColorToken,
        isSystem: row.is_system ?? false,
      },
    ];
  });
}
