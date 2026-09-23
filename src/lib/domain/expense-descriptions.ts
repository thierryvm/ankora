/**
 * Descriptions of an expense — suggestions while typing, and the category they
 * recall. v3 mock-up, rule 26: « the description says WHERE, the category says
 * WHAT ».
 *
 * From the first letter, six suggestions at most: first the descriptions the
 * person has already written (by frequency, then by date), ALWAYS before the
 * built-in list of brands. Matching ignores case and accents and works on the
 * start of any word. Choosing a suggestion ticks a category: for an own
 * description, the one of its most recent expense (derived, nothing stored);
 * for a brand, the person's first category whose name belongs to the brand's
 * family. Neither found: the category already ticked stays.
 *
 * Pure TypeScript — no I/O, no framework (CLAUDE.md rule 1).
 */

/**
 * The Unicode "combining diacritical marks" block, U+0300 to U+036F — what NFD
 * splits off a letter such as « é ».
 *
 * Built from char codes on purpose: written as a regex literal, the range must
 * be spelled with backslash escapes, and an editor that turns those escapes into
 * the invisible combining characters themselves leaves a line nobody can read or
 * review. Not `\p{Diacritic}`, which covers far more than this block.
 */
const COMBINING_MARKS = new RegExp(
  '[' + String.fromCharCode(92) + 'u0300-' + String.fromCharCode(92) + 'u036f]',
  'g',
);

/**
 * Case-, accent- and punctuation-insensitive form of a text: lower case,
 * diacritics removed, every run of non-alphanumerics collapsed into one space.
 */
export function fold(text: unknown): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * For each brand family, the category names that may receive it, in order of
 * preference. None of them among the person's categories: no category is
 * proposed. Production data to maintain (v3 coverage, F-34).
 */
export const BRAND_FAMILY_CATEGORIES = {
  courses: ['Courses', 'Alimentation', 'Supermarché'],
  carburant: ['Carburant', 'Essence'],
  maison: ['Maison', 'Divers'],
  bricolage: ['Bricolage', 'Maison'],
  soins: ['Hygiène', 'Soins', 'Santé'],
  vetements: ['Vêtements', 'Habillement'],
  sport: ['Sport', 'Loisirs'],
  electro: ['Électroménager', 'Électronique', 'Maison'],
} as const satisfies Record<string, readonly string[]>;

export type BrandFamily = keyof typeof BRAND_FAMILY_CATEGORIES;

const GROCERIES = [
  'Colruyt',
  'OKay',
  'Bio-Planet',
  'Delhaize',
  'AD Delhaize',
  'Proxy Delhaize',
  'Carrefour',
  'Carrefour Market',
  'Carrefour Express',
  'Lidl',
  'Aldi',
  'Intermarché',
  'Albert Heijn',
  'Spar',
  'Match',
  'Smatch',
  'Cora',
  'Kaufland',
  'Rewe',
  'Edeka',
] as const;

const FUEL = ['TotalEnergies', 'Q8', 'Shell', 'Esso', 'Texaco', 'Lukoil', 'DATS 24'] as const;

/**
 * The built-in brands, `[name, family]`, in the order they are suggested. The
 * spelling is exact — it is what gets written into the expense.
 */
export const BRANDS: readonly (readonly [string, BrandFamily])[] = [
  ...GROCERIES.map((name) => [name, 'courses'] as const),
  ['Action', 'maison'],
  ['Kruidvat', 'soins'],
  ['Di', 'soins'],
  ['Hema', 'maison'],
  ['Zeeman', 'vetements'],
  ['Brico', 'bricolage'],
  ['Hubo', 'bricolage'],
  ['IKEA', 'maison'],
  ['Decathlon', 'sport'],
  ['MediaMarkt', 'electro'],
  ['Krëfel', 'electro'],
  ['Vanden Borre', 'electro'],
  ['dm', 'soins'],
  ['Rossmann', 'soins'],
  ...FUEL.map((name) => [name, 'carburant'] as const),
];

/** A description the person has already written, aggregated over their expenses. */
export type OwnDescription = {
  /** As written the most recent time. */
  label: string;
  /** Category of the most recent expense under this description. */
  categoryId: string | null;
  /** How many expenses carry it. */
  count: number;
  /** Date (`YYYY-MM-DD`) of the most recent one. */
  lastOn: string;
};

export type DescriptionSuggestion = {
  label: string;
  /** The category choosing it will tick — `null`: the ticked one stays. */
  categoryId: string | null;
  /** How many times the person wrote it; 0 for a brand. */
  count: number;
};

type NamedCategory = { id: string; name: string };

/** Maximum number of suggestions shown under the field. */
export const MAX_SUGGESTIONS = 6;

function familyCategory(family: BrandFamily, categories: readonly NamedCategory[]): string | null {
  for (const name of BRAND_FAMILY_CATEGORIES[family]) {
    const target = fold(name);
    const found = categories.find((category) => fold(category.name) === target);
    if (found) return found.id;
  }
  return null;
}

function brandCategory(label: string, categories: readonly NamedCategory[]): string | null {
  const target = fold(label);
  const brand = BRANDS.find(([name]) => fold(name) === target);
  return brand ? familyCategory(brand[1], categories) : null;
}

/**
 * The category an own description implies: its remembered one if it still
 * exists among `categories`, otherwise that of the brand of the same name.
 */
function ownCategory(description: OwnDescription, categories: readonly NamedCategory[]) {
  const remembered = categories.some((category) => category.id === description.categoryId)
    ? description.categoryId
    : null;
  return remembered ?? brandCategory(description.label, categories);
}

function byCountThenRecency(a: OwnDescription, b: OwnDescription): number {
  return b.count - a.count || b.lastOn.localeCompare(a.lastOn);
}

/**
 * At most {@link MAX_SUGGESTIONS} suggestions for what is being typed.
 *
 * Own descriptions first (count, then most recent), then the brands not
 * already among them — those whose NAME starts with the query first (« d »:
 * Delhaize before AD Delhaize), then list order.
 */
export function suggestDescriptions(
  query: string,
  own: readonly OwnDescription[],
  categories: readonly NamedCategory[],
): DescriptionSuggestion[] {
  const q = fold(query);
  if (!q) return [];
  const startsAWord = (text: string) => ` ${fold(text)}`.includes(` ${q}`);

  const mine = own
    .filter((description) => startsAWord(description.label))
    .sort(byCountThenRecency)
    .map((description) => ({
      label: description.label,
      categoryId: ownCategory(description, categories),
      count: description.count,
    }));

  const already = new Set(mine.map((suggestion) => fold(suggestion.label)));
  const brands = BRANDS.map(([name, family], index) => ({
    name,
    family,
    index,
    rank: fold(name).startsWith(q) ? 0 : 1,
  }))
    .filter((brand) => !already.has(fold(brand.name)) && startsAWord(brand.name))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((brand) => ({
      label: brand.name,
      categoryId: familyCategory(brand.family, categories),
      count: 0,
    }));

  return [...mine, ...brands].slice(0, MAX_SUGGESTIONS);
}

/**
 * The category to tick for a description typed in full, without choosing a
 * suggestion: same rule as a suggestion, on an exact folded match with one of
 * the person's own descriptions. `null` when it is not one of theirs.
 */
export function recallCategory(
  label: string,
  own: readonly OwnDescription[],
  categories: readonly NamedCategory[],
): string | null {
  const target = fold(label);
  if (!target) return null;
  const match = own.find((description) => fold(description.label) === target);
  return match ? ownCategory(match, categories) : null;
}

/** One expense, as read to build the person's descriptions. */
export type DescriptionSource = {
  label: string;
  categoryId: string | null;
  occurredOn: string;
  /** Tie-breaker between two expenses of the same day: the later entry wins. */
  createdAt: string;
};

/**
 * The person's own descriptions, aggregated from their expenses: one per
 * folded description, counted, shown and categorised as the most recent one.
 *
 * A description that says no place is left out: empty once folded, equal to
 * the name of a category (the sheet writes the category name in place of an
 * empty description), or equal to a default word (written when there was not
 * even a category).
 */
export function ownDescriptionsFrom(
  rows: readonly DescriptionSource[],
  excluded: { categoryNames: readonly string[]; fallbackLabels: readonly string[] },
): OwnDescription[] {
  const silent = new Set([...excluded.categoryNames, ...excluded.fallbackLabels].map(fold));
  const byKey = new Map<string, OwnDescription & { lastCreatedAt: string }>();

  for (const row of rows) {
    const key = fold(row.label);
    if (!key || silent.has(key)) continue;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, {
        label: row.label.trim(),
        categoryId: row.categoryId,
        count: 1,
        lastOn: row.occurredOn,
        lastCreatedAt: row.createdAt,
      });
      continue;
    }
    current.count += 1;
    const newer =
      row.occurredOn > current.lastOn ||
      (row.occurredOn === current.lastOn && row.createdAt > current.lastCreatedAt);
    if (newer) {
      current.label = row.label.trim();
      current.categoryId = row.categoryId;
      current.lastOn = row.occurredOn;
      current.lastCreatedAt = row.createdAt;
    }
  }

  return [...byKey.values()]
    .map(({ label, categoryId, count, lastOn }) => ({ label, categoryId, count, lastOn }))
    .sort(byCountThenRecency);
}
