import { CATEGORY_NAMES_BY_FAMILY, ENSEIGNES, type ChainFamily } from './enseignes';

/**
 * The description says WHERE, the category says WHAT FOR (DESIGN-v3 rule 26).
 *
 * Pure functions behind the description field of the ⊕ sheet: the person's own
 * descriptions first, then the built-in chains, and the category a description
 * recalls (F-20). Nothing is stored: the recalled category is derived from the
 * person's expenses, read through RLS by the caller.
 */

export const MAX_SUGGESTIONS = 6;

/** The words the sheet writes when the description is left empty. Never suggested. */
const FALLBACK_WORDS = new Set(['depense', 'expense']);

/** Case, accents and punctuation folded away: « Intermarché » and « intermarche » are one. */
export function foldDescription(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export type DescriptionEntry = {
  label: string;
  count: number;
  lastOn: string;
  lastCategoryId: string | null;
};

type CategoryRef = { id: string; name: string };

/**
 * One entry per description, most used first, then most recent.
 *
 * A label equal to the name of ITS OWN category is the fallback the sheet
 * writes for an empty description — it names no place, so it is skipped. The
 * same word under another category is a real description and stays.
 */
export function descriptionHistory(
  rows: readonly { label: string; occurredOn: string; categoryId: string | null }[],
  categories: readonly CategoryRef[],
): DescriptionEntry[] {
  const nameById = new Map(categories.map((c) => [c.id, foldDescription(c.name)]));
  const seen = new Map<string, DescriptionEntry>();
  for (const row of rows) {
    const label = row.label.trim();
    const key = foldDescription(label);
    if (!key || FALLBACK_WORDS.has(key)) continue;
    if (row.categoryId !== null && nameById.get(row.categoryId) === key) continue;
    const entry = seen.get(key);
    if (!entry) {
      seen.set(key, { label, count: 1, lastOn: row.occurredOn, lastCategoryId: row.categoryId });
      continue;
    }
    entry.count += 1;
    // At an equal date the later row wins, as in the mockup.
    if (row.occurredOn >= entry.lastOn) {
      Object.assign(entry, { label, lastOn: row.occurredOn, lastCategoryId: row.categoryId });
    }
  }
  return [...seen.values()].sort(
    (a, b) => b.count - a.count || (a.lastOn < b.lastOn ? 1 : a.lastOn > b.lastOn ? -1 : 0),
  );
}

function categoryForFamily(family: ChainFamily, categories: readonly CategoryRef[]): string | null {
  for (const name of CATEGORY_NAMES_BY_FAMILY[family]) {
    const hit = categories.find((c) => foldDescription(c.name) === foldDescription(name));
    if (hit) return hit.id;
  }
  return null;
}

function chainCategory(label: string, categories: readonly CategoryRef[]): string | null {
  const key = foldDescription(label);
  const chain = ENSEIGNES.find(([name]) => foldDescription(name) === key);
  return chain ? categoryForFamily(chain[1], categories) : null;
}

export type DescriptionSuggestion = {
  label: string;
  /** The category choosing it will check, or null to leave the current one. */
  categoryId: string | null;
  source: 'mine' | 'chain';
  /** How many times the person wrote it; 0 for a chain. */
  count: number;
};

/**
 * At most {@link MAX_SUGGESTIONS}, matching the start of any word: the
 * person's descriptions ALWAYS before the built-in chains. Among chains, those
 * whose name starts with the letters come first (« delh »: Delhaize before
 * AD Delhaize), then list order. `categories` is the selectable set: a
 * remembered category that left it is not proposed.
 */
export function suggestDescriptions(
  query: string,
  history: readonly DescriptionEntry[],
  categories: readonly CategoryRef[],
): DescriptionSuggestion[] {
  const q = foldDescription(query);
  if (!q) return [];
  const startsAWord = (label: string) => ` ${foldDescription(label)}`.includes(` ${q}`);
  const selectable = new Set(categories.map((c) => c.id));

  const mine: DescriptionSuggestion[] = history
    .filter((h) => startsAWord(h.label))
    .map((h) => ({
      label: h.label,
      categoryId:
        h.lastCategoryId !== null && selectable.has(h.lastCategoryId)
          ? h.lastCategoryId
          : chainCategory(h.label, categories),
      source: 'mine' as const,
      count: h.count,
    }));
  const already = new Set(mine.map((m) => foldDescription(m.label)));

  const chains: DescriptionSuggestion[] = ENSEIGNES.map(([label, family], index) => ({
    label,
    family,
    index,
    rank: foldDescription(label).startsWith(q) ? 0 : 1,
  }))
    .filter((c) => !already.has(foldDescription(c.label)) && startsAWord(c.label))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((c) => ({
      label: c.label,
      categoryId: categoryForFamily(c.family, categories),
      source: 'chain' as const,
      count: 0,
    }));

  return [...mine, ...chains].slice(0, MAX_SUGGESTIONS);
}

/**
 * F-20 — the category a typed description recalls: the one of its most recent
 * expense when still selectable, else the family of a known chain, else none.
 */
export function recallCategory(
  label: string,
  history: readonly DescriptionEntry[],
  categories: readonly CategoryRef[],
): string | null {
  const key = foldDescription(label);
  if (!key) return null;
  const mine = history.find((h) => foldDescription(h.label) === key);
  if (mine?.lastCategoryId && categories.some((c) => c.id === mine.lastCategoryId)) {
    return mine.lastCategoryId;
  }
  return chainCategory(label, categories);
}

export type DescribedLine = { id: string; label: string; amount: number; occurredOn: string };

export type DescriptionGroup = {
  /** `null` gathers the lines with no description (empty, or the category name). */
  label: string | null;
  total: number;
  lines: DescribedLine[];
};

/**
 * The detail of a category, grouped by description: largest subtotal first,
 * ties by name, « Sans libellé » last. Lines inside a group, newest first.
 * Sums in integer cents so the subtotals add up to the category total exactly.
 */
export function groupByDescription(
  lines: readonly DescribedLine[],
  categoryName: string,
): DescriptionGroup[] {
  const categoryKey = foldDescription(categoryName);
  const groups = new Map<string, { label: string | null; cents: number; lines: DescribedLine[] }>();
  for (const line of lines) {
    const key = foldDescription(line.label);
    const none = !key || key === categoryKey || FALLBACK_WORDS.has(key);
    const id = none ? '' : key;
    const group = groups.get(id) ?? { label: none ? null : line.label.trim(), cents: 0, lines: [] };
    group.cents += Math.round(line.amount * 100);
    group.lines.push(line);
    groups.set(id, group);
  }
  return [...groups.values()]
    .sort((a, b) => {
      if (a.label === null) return 1;
      if (b.label === null) return -1;
      return b.cents - a.cents || a.label.localeCompare(b.label, 'fr');
    })
    .map((g) => ({
      label: g.label,
      total: g.cents / 100,
      lines: [...g.lines].sort((a, b) =>
        a.occurredOn < b.occurredOn ? 1 : a.occurredOn > b.occurredOn ? -1 : 0,
      ),
    }));
}

export type CategoryBreakdown = {
  /** `null` gathers the expenses with no category (rows written before F-6). */
  categoryId: string | null;
  name: string | null;
  colorToken: string | null;
  total: number;
  groups: DescriptionGroup[];
};

/**
 * « Dépensé en {mois} » opened on what makes it (rule 10): per category, the
 * largest first, « Sans catégorie » last; each category opened on its
 * descriptions. Fed with the COMPLETE month, never a capped list: a total
 * summed from 50 rows would lie past the 51st.
 */
export function breakdownByCategory(
  lines: readonly (DescribedLine & { categoryId: string | null })[],
  categories: readonly { id: string; name: string; colorToken: string }[],
): CategoryBreakdown[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const buckets = new Map<string, DescribedLine[]>();
  for (const line of lines) {
    const key = line.categoryId !== null && byId.has(line.categoryId) ? line.categoryId : '';
    const bucket = buckets.get(key) ?? [];
    bucket.push(line);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .map(([key, bucket]) => {
      const category = key ? byId.get(key)! : null;
      const groups = groupByDescription(bucket, category?.name ?? '');
      const cents = groups.reduce((sum, g) => sum + Math.round(g.total * 100), 0);
      return {
        categoryId: category?.id ?? null,
        name: category?.name ?? null,
        colorToken: category?.colorToken ?? null,
        total: cents / 100,
        groups,
      };
    })
    .sort((a, b) => {
      if (a.categoryId === null) return 1;
      if (b.categoryId === null) return -1;
      return b.total - a.total || (a.name ?? '').localeCompare(b.name ?? '', 'fr');
    });
}
