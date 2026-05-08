/**
 * Hamilton (largest remainder) method for distributing percentages so that
 * they sum to exactly 100 with integer outputs.
 *
 * Used in admin panel for Top sources / Drop-off breakdown so percentages
 * never round to 99 % or 101 %. Pure function, no side effects.
 *
 * @param values - Counts per bucket (e.g. [12, 8, 5, 3, 2] for 5 sources)
 * @param total - Reference total (typically sum(values), but caller may pass
 *   another reference for ratio-based distribution)
 * @returns Integer percentages, same length as `values`, summing to exactly 100
 *   when total > 0. Returns an array of zeros when total = 0 or values is empty.
 */
export function largestRemainderRound(values: readonly number[], total: number): number[] {
  if (values.length === 0) return [];
  if (total === 0) return values.map(() => 0);

  const exact = values.map((v) => (v / total) * 100);
  const floored = exact.map(Math.floor);
  const remainders = exact.map((v, idx) => ({ idx, rem: v - Math.floor(v) }));
  const distributed = floored.reduce((acc, b) => acc + b, 0);
  const toDistribute = 100 - distributed;

  // Sort descending by remainder ; ties broken by index (stable)
  remainders.sort((a, b) => {
    if (b.rem !== a.rem) return b.rem - a.rem;
    return a.idx - b.idx;
  });

  const result = [...floored];
  for (let i = 0; i < toDistribute && i < remainders.length; i++) {
    const target = remainders[i];
    if (target) result[target.idx] = (result[target.idx] ?? 0) + 1;
  }

  return result;
}
