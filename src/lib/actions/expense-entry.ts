'use server';

import { getCategories } from '@/lib/data/categories';
import { loadMonthSituation } from '@/lib/data/month-situation';
import { expenseCategoryChips } from '@/lib/domain/categories';
import { ownDescriptionsFrom, type OwnDescription } from '@/lib/domain/expense-descriptions';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/types';
import type { ExpenseEntryContext } from '@/lib/actions/expense-entry.types';

/**
 * Everything the ⊕ expense sheet needs, fetched when it opens.
 *
 * ## Why lazily, and not through the layout
 *
 * The ⊕ lives in `BottomTabBar`, mounted at the locale root — which renders on
 * `/faq`, `/legal/*` and `/admin` too, for any signed-in visitor. Feeding it
 * from there would put a workspace read plus a commitment read on every one of
 * those pages, to serve a sheet that most of those visits never open. One
 * action, called on EVERY opening of the sheet (PR D): the figures it returns
 * move from other screens — a transfer with a free share, money received — so
 * a context kept from the first opening would compute « Il te restera » on a
 * stale « Il te reste ». Nothing is cached between openings.
 *
 * ## What this costs the 2-tap promise: nothing
 *
 * The amount field is focused and the numeric keypad is up before this
 * resolves. The chips and the « Il te restera » line arrive after, into a
 * skeleton. A user who taps ⊕ and immediately types a figure never waits — and
 * a user who does wait sees a skeleton, not an empty box.
 */

/** How many recent expenses feed the description suggestions. */
const DESCRIPTION_SOURCE_ROWS = 200;

/**
 * The default word the sheet writes when an expense has neither description
 * nor category — `app.expenses.addSheet.fallbackLabel`, in every locale the
 * sheet may have been used in. It names no place, so it is never suggested.
 * Kept in step with the messages by `expense-entry.test.ts`.
 */
const FALLBACK_LABELS = ['Dépense', 'Uitgave', 'Expense', 'Ausgabe', 'Gasto'];

/**
 * The workspace's own descriptions, read with the SESSION client (RLS applies)
 * and scoped to the workspace explicitly. A failed read yields no suggestion
 * rather than a failed sheet, and no description is ever logged.
 */
async function readOwnDescriptions(
  workspaceId: string,
  categoryNames: readonly string[],
): Promise<OwnDescription[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('expenses')
      .select('label, category_id, occurred_on, created_at')
      .eq('workspace_id', workspaceId)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(DESCRIPTION_SOURCE_ROWS);
    if (error || !data) return [];
    return ownDescriptionsFrom(
      data.map((row) => ({
        label: row.label,
        categoryId: row.category_id,
        occurredOn: row.occurred_on,
        createdAt: row.created_at,
      })),
      { categoryNames, fallbackLabels: FALLBACK_LABELS },
    );
  } catch {
    return [];
  }
}

export async function getExpenseEntryContextAction(): Promise<ActionResult<ExpenseEntryContext>> {
  // No rate limit: this is a read on the caller's own workspace, gated by the
  // same session + RLS as the page that hosts it, and the mutation it precedes
  // is itself limited. Rate-limiting it would throttle opening a sheet.
  const { snapshot, situation, todayIso } = await loadMonthSituation();
  const categories = await getCategories(snapshot.workspaceId);
  const descriptions = await readOwnDescriptions(
    snapshot.workspaceId,
    categories.map((category) => category.name),
  );

  const { chips, overflow, preselectedId } = expenseCategoryChips(
    categories,
    snapshot.monthlyExpenses,
    todayIso,
  );

  const strip = (category: { id: string; name: string; colorToken: string }) => ({
    id: category.id,
    name: category.name,
    colorToken: category.colorToken,
  });

  return {
    ok: true,
    data: {
      chips: chips.map(strip),
      overflow: overflow.map(strip),
      preselectedId,
      descriptions,
      // Decimal never crosses the RSC / action boundary — it loses its
      // prototype. Numbers here, formatting client-side.
      ilTeReste: situation.ilTeReste.toNumber(),
      budgetDuMois: situation.resteDisponible.toNumber(),
      depensesDuMois: situation.depensesDuMois.toNumber(),
      incomplet: situation.statut === 'incomplet',
      todayIso,
    },
  };
}
