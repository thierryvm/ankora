/**
 * The built-in list of shop chains offered under the description field (F-34).
 *
 * Production data to maintain, not decoration: a misspelt chain shows up on
 * every entry. Spelling is exact. Belgium, plus the German chains that border
 * dwellers use (Kaufland, Rewe, Edeka, dm, Rossmann).
 *
 * Each chain carries a FAMILY, not a category: categories belong to the person
 * and are named by them. {@link CATEGORY_NAMES_BY_FAMILY} lists, per family, the
 * category names that can take it, in order of preference; when none exists in
 * the workspace, nothing is pre-selected.
 */

export type ChainFamily =
  'courses' | 'carburant' | 'maison' | 'bricolage' | 'soins' | 'vetements' | 'sport' | 'electro';

export const CATEGORY_NAMES_BY_FAMILY: Readonly<Record<ChainFamily, readonly string[]>> = {
  courses: ['Courses', 'Alimentation', 'Supermarché'],
  carburant: ['Carburant', 'Essence'],
  maison: ['Maison', 'Divers'],
  bricolage: ['Bricolage', 'Maison'],
  soins: ['Hygiène', 'Soins', 'Santé'],
  vetements: ['Vêtements', 'Habillement'],
  sport: ['Sport', 'Loisirs'],
  electro: ['Électroménager', 'Électronique', 'Maison'],
};

const family =
  (f: ChainFamily) =>
  (name: string): readonly [string, ChainFamily] => [name, f];

export const ENSEIGNES: readonly (readonly [string, ChainFamily])[] = [
  ...[
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
  ].map(family('courses')),
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
  ...['TotalEnergies', 'Q8', 'Shell', 'Esso', 'Texaco', 'Lukoil', 'DATS 24'].map(
    family('carburant'),
  ),
];
