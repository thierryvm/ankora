'use server';

import { authorizedWorkspace } from '@/lib/actions/authorized-workspace';
import { revalidateAppPath, revalidateDashboard } from '@/lib/actions/revalidate';
import { categorieHomonyme } from '@/lib/domain/categories';
import { planCategoryMerge } from '@/lib/domain/categories/merge';
import { categoryMergeInputSchema, emptyCategoriesDeleteSchema } from '@/lib/schemas/category';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/types';
import type { CategoryMergeResult, MergeableCategory } from '@/lib/actions/categories.types';

type Supabase = Awaited<ReturnType<typeof createClient>>;
type CategoryRow = { id: string; name: string; kind: string; is_system: boolean };

/** Rows read per page: under PostgREST's default `max-rows`, so no page is cut short. */
const PAGE = 500;
/** Ids per `in (...)` filter, to keep the request URL short. */
const CHUNK = 100;
/** The tables whose rows carry a category and follow a merge. */
const FOLLOWERS = ['expenses', 'charges', 'commitments'] as const;

const validation = (issues: Record<string, string[]>) => ({
  ok: false as const,
  errorCode: 'errors.validation.generic',
  fieldErrors: issues,
});

/** The workspace's categories, read with the session client (RLS applies) and scoped explicitly. */
async function readCategories(supabase: Supabase, workspaceId: string) {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, kind, is_system, color_token')
    .eq('workspace_id', workspaceId);
  if (error || !data) return null;
  return data as Array<CategoryRow & { color_token: string | null }>;
}

async function countIn(
  supabase: Supabase,
  table: (typeof FOLLOWERS)[number],
  workspaceId: string,
  categoryId: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('category_id', categoryId);
  return error || count === null ? null : count;
}

/**
 * The expense categories the merge sheet offers, each with how many expenses
 * (all months) and bills/commitments it holds — read when the sheet opens,
 * never at page render (same pattern as `getExpenseEntryContextAction`).
 */
export async function getCategoryMergeContextAction(): Promise<ActionResult<MergeableCategory[]>> {
  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;
  const supabase = await createClient();
  const categories = await readCategories(supabase, ctx.workspaceId);
  if (!categories) return { ok: false, errorCode: 'errors.categories.mergeFailed' };

  const variables = categories.filter((c) => c.kind === 'variable');
  const result: MergeableCategory[] = [];
  for (const c of variables) {
    const [expenses, charges, commitments] = await Promise.all([
      countIn(supabase, 'expenses', ctx.workspaceId, c.id),
      countIn(supabase, 'charges', ctx.workspaceId, c.id),
      countIn(supabase, 'commitments', ctx.workspaceId, c.id),
    ]);
    if (expenses === null || charges === null || commitments === null) {
      return { ok: false, errorCode: 'errors.categories.mergeFailed' };
    }
    result.push({
      id: c.id,
      name: c.name,
      colorToken: c.color_token,
      isSystem: c.is_system,
      expenseCount: expenses,
      billCount: charges + commitments,
    });
  }
  result.sort((a, b) => b.expenseCount - a.expenseCount || a.name.localeCompare(b.name));
  return { ok: true, data: result };
}

/**
 * Regroup several expense categories into one post: « Intermarché » and
 * « Colruyt » into « Courses ». The category says what for, the description
 * says where (DESIGN-v3 rule 26).
 *
 * ## What is written, in this order
 *
 * 1. The new target, when there is one.
 * 2. Expenses whose description is only the sheet's fallback word take their
 *    old category's name as description (`planCategoryMerge`).
 * 3. Per source, per table (expenses, bills, commitments): the rows read and
 *    confirmed above, by id and still in that source, returning their ids.
 *
 * Nothing is deleted: the sources stay, empty, and deleting them is a separate
 * confirmed gesture (`deleteEmptyCategoriesAction`). No amount is ever written.
 *
 * ## Not all-or-nothing, and what that leaves
 *
 * Without a SQL function (a migration, out of scope) the writes are separate
 * statements. A failure stops at once and answers `mergePartial`: some sources
 * may already be re-filed, the others still hold their rows, no amount has
 * moved and no category has gone — so the same gesture, run again, finishes
 * the job. What did move is in the audit trace either way.
 */
export async function mergeCategoriesAction(
  input: unknown,
): Promise<ActionResult<CategoryMergeResult>> {
  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = categoryMergeInputSchema.safeParse(input);
  if (!parsed.success) {
    return validation(parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }
  const { target, confirmedExpenseCount } = parsed.data;
  const sourceIds = [...new Set(parsed.data.sourceIds)];

  const supabase = await createClient();
  const categories = await readCategories(supabase, ctx.workspaceId);
  if (!categories) return { ok: false, errorCode: 'errors.categories.mergeFailed' };

  // Every source, and an existing target, must be an EXPENSE category of the
  // session's workspace. The list was read scoped to it, so an id from
  // anywhere else is simply not found.
  const byId = new Map(categories.map((c) => [c.id, c]));
  const sources = sourceIds.map((id) => byId.get(id));
  const invalid = { ok: false as const, errorCode: 'errors.categories.mergeInvalid' };
  if (sources.some((s) => !s || s.kind !== 'variable')) return invalid;
  if (target.kind === 'existing') {
    const t = byId.get(target.id);
    if (!t || t.kind !== 'variable' || sourceIds.includes(target.id)) return invalid;
  }

  // The expenses of the sources, every page of them.
  const rows: Array<{ id: string; label: string; category_id: string; amount: string | number }> =
    [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('expenses')
      .select('id, label, category_id, amount')
      .eq('workspace_id', ctx.workspaceId)
      .in('category_id', sourceIds)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data) return { ok: false, errorCode: 'errors.categories.mergeFailed' };
    rows.push(...(data as typeof rows));
    if (data.length < PAGE) break;
  }

  const placeholderTarget = target.kind === 'existing' ? target.id : '—new—';
  const plan = planCategoryMerge({
    workspaceId: ctx.workspaceId,
    sources: sources.map((s) => ({ id: s!.id, name: s!.name })),
    targetId: placeholderTarget,
    rows: rows.map((r) => ({
      id: r.id,
      workspaceId: ctx.workspaceId,
      categoryId: r.category_id,
      label: r.label,
      amount: r.amount,
    })),
  });
  // The bills and commitments of the sources, read now: what is moved later is
  // exactly these rows (by id), so the confirmation covers what is written.
  const billIds = {
    charges: new Map<string, string[]>(),
    commitments: new Map<string, string[]>(),
  };
  for (const table of ['charges', 'commitments'] as const) {
    const { data, error } = await supabase
      .from(table)
      .select('id, category_id')
      .eq('workspace_id', ctx.workspaceId)
      .in('category_id', sourceIds);
    if (error || !data) return { ok: false, errorCode: 'errors.categories.mergeFailed' };
    for (const r of data as Array<{ id: string; category_id: string }>) {
      billIds[table].set(r.category_id, [...(billIds[table].get(r.category_id) ?? []), r.id]);
    }
  }
  const billCount = [...billIds.charges.values(), ...billIds.commitments.values()].reduce(
    (n, ids) => n + ids.length,
    0,
  );
  if (
    plan.movedExpenseIds.length !== confirmedExpenseCount ||
    billCount !== parsed.data.confirmedBillCount
  ) {
    return { ok: false, errorCode: 'errors.categories.mergeStale' };
  }
  const expenseIdsOf = new Map<string, string[]>();
  for (const r of rows) {
    expenseIdsOf.set(r.category_id, [...(expenseIdsOf.get(r.category_id) ?? []), r.id]);
  }

  // 1. The new target.
  let targetId = placeholderTarget;
  if (target.kind === 'new') {
    const homonyme = categorieHomonyme(
      target.name,
      categories.flatMap((c) =>
        c.kind === 'variable' || c.kind === 'fixed' || c.kind === 'income'
          ? [{ name: c.name, kind: c.kind }]
          : [],
      ),
    );
    if (homonyme) {
      return {
        ok: false,
        errorCode:
          homonyme.kind === 'variable'
            ? 'errors.categories.duplicate'
            : 'errors.categories.duplicateBill',
      };
    }
    const { data, error } = await supabase
      .from('categories')
      .insert({
        workspace_id: ctx.workspaceId,
        created_by: ctx.userId,
        name: target.name,
        color_token: target.colorToken,
        kind: 'variable',
        is_system: false,
      })
      .select('id')
      .single();
    if (error || !data) return { ok: false, errorCode: 'errors.categories.mergeFailed' };
    targetId = data.id;
    await logAuditEvent(
      AuditEvent.CATEGORY_CREATED,
      { userId: ctx.userId, workspaceId: ctx.workspaceId },
      { resource_id: targetId, resource_type: 'category' },
    );
  }

  // From here on something may already be written (the new target at least):
  // every exit traces what moved and revalidates, and a failure says so.
  type Moved = {
    category_id: string;
    expense_ids: string[];
    charge_ids: string[];
    commitment_ids: string[];
  };
  const moved: Moved[] = [];
  let wrote = target.kind === 'new';
  let failed = false;

  // 2. The fallback descriptions take the old category's name.
  relabel: for (const relabel of plan.relabels) {
    for (let i = 0; i < relabel.expenseIds.length; i += CHUNK) {
      const { error } = await supabase
        .from('expenses')
        .update({ label: relabel.label })
        .eq('workspace_id', ctx.workspaceId)
        .in('id', relabel.expenseIds.slice(i, i + CHUNK));
      if (error) {
        failed = true;
        break relabel;
      }
      wrote = true;
    }
  }

  // 3. Re-file, source by source, table by table: only the rows read and
  // confirmed above (by id, AND still in that source). A row added meanwhile
  // stays where it is, and deleting the source will then refuse.
  if (!failed) {
    sources: for (const sourceId of sourceIds) {
      const trace: Moved = {
        category_id: sourceId,
        expense_ids: [],
        charge_ids: [],
        commitment_ids: [],
      };
      moved.push(trace);
      const lots: Array<[(typeof FOLLOWERS)[number], string[], string[]]> = [
        ['expenses', expenseIdsOf.get(sourceId) ?? [], trace.expense_ids],
        ['charges', billIds.charges.get(sourceId) ?? [], trace.charge_ids],
        ['commitments', billIds.commitments.get(sourceId) ?? [], trace.commitment_ids],
      ];
      for (const [table, ids, into] of lots) {
        for (let i = 0; i < ids.length; i += CHUNK) {
          const { data, error } = await supabase
            .from(table)
            .update({ category_id: targetId })
            .eq('workspace_id', ctx.workspaceId)
            .eq('category_id', sourceId)
            .in('id', ids.slice(i, i + CHUNK))
            .select('id');
          if (error || !data) {
            failed = true;
            break sources;
          }
          wrote = true;
          into.push(...(data as Array<{ id: string }>).map((r) => r.id));
        }
      }
    }
  }

  const movedExpenses = moved.reduce((n, m) => n + m.expense_ids.length, 0);
  if (wrote) {
    await logAuditEvent(
      AuditEvent.CATEGORY_MERGED,
      { userId: ctx.userId, workspaceId: ctx.workspaceId },
      { resource_type: 'category', resource_id: targetId, count: movedExpenses, moved },
    );
    revalidateDashboard();
    revalidateAppPath('expenses');
    revalidateAppPath('charges');
  }

  if (failed) {
    return {
      ok: false,
      errorCode: wrote ? 'errors.categories.mergePartial' : 'errors.categories.mergeFailed',
    };
  }
  return { ok: true, data: { targetId, movedExpenses, emptiedCategoryIds: sourceIds } };
}

/**
 * Delete expense categories that hold nothing any more — the gesture the merge
 * sheet offers afterwards, confirmed on its own. A system category is never
 * deleted, and a category still holding an expense, a bill or a commitment is
 * refused rather than emptied (its rows would otherwise lose their category in
 * silence, through `on delete set null`).
 */
export async function deleteEmptyCategoriesAction(
  input: unknown,
): Promise<ActionResult<{ deleted: number }>> {
  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = emptyCategoriesDeleteSchema.safeParse(input);
  if (!parsed.success) {
    return validation(parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }
  const ids = [...new Set(parsed.data.ids)];

  const supabase = await createClient();
  const categories = await readCategories(supabase, ctx.workspaceId);
  if (!categories) return { ok: false, errorCode: 'errors.categories.mergeFailed' };
  const byId = new Map(categories.map((c) => [c.id, c]));
  for (const id of ids) {
    const c = byId.get(id);
    if (!c || c.kind !== 'variable' || c.is_system) {
      return { ok: false, errorCode: 'errors.categories.mergeInvalid' };
    }
  }

  for (const id of ids) {
    for (const table of FOLLOWERS) {
      const n = await countIn(supabase, table, ctx.workspaceId, id);
      if (n === null) return { ok: false, errorCode: 'errors.categories.mergeFailed' };
      if (n > 0) return { ok: false, errorCode: 'errors.categories.notEmpty' };
    }
  }

  const { data, error } = await supabase
    .from('categories')
    .delete()
    .eq('workspace_id', ctx.workspaceId)
    .eq('is_system', false)
    .in('id', ids)
    .select('id');
  if (error || !data) return { ok: false, errorCode: 'errors.categories.mergeFailed' };

  const deleted = (data as Array<{ id: string }>).map((r) => r.id);
  for (const id of deleted) {
    await logAuditEvent(
      AuditEvent.CATEGORY_DELETED,
      { userId: ctx.userId, workspaceId: ctx.workspaceId },
      { resource_id: id, resource_type: 'category' },
    );
  }

  revalidateDashboard();
  revalidateAppPath('expenses');
  return { ok: true, data: { deleted: deleted.length } };
}
