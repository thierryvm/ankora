'use server';

import { getCategories } from '@/lib/data/categories';
import { loadMonthSituation } from '@/lib/data/month-situation';
import { expenseCategoryChips } from '@/lib/domain/categories';
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
 * action, called on the first open, caches for the life of the component.
 *
 * ## What this costs the 2-tap promise: nothing
 *
 * The amount field is focused and the numeric keypad is up before this
 * resolves. The chips and the « Il te restera » line arrive after, into a
 * skeleton. A user who taps ⊕ and immediately types a figure never waits — and
 * a user who does wait sees a skeleton, not an empty box.
 */

export async function getExpenseEntryContextAction(): Promise<ActionResult<ExpenseEntryContext>> {
  // No rate limit: this is a read on the caller's own workspace, gated by the
  // same session + RLS as the page that hosts it, and the mutation it precedes
  // is itself limited. Rate-limiting it would throttle opening a sheet.
  const { snapshot, situation, todayIso } = await loadMonthSituation();
  const categories = await getCategories(snapshot.workspaceId);

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
