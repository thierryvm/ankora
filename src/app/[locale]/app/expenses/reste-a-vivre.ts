/**
 * « Reste à vivre » display math for the expenses page — the monthly daily-living
 * budget minus what has actually been spent this month, with a live per-day
 * figure. Pure, number-based (display only): the money is already `number` at
 * this UI boundary, and each output is a single operation (no lossy summation
 * happens here — the caller sums the month's expenses once).
 */
export type ResteAVivreStatus = {
  budget: number;
  spent: number;
  /** budget − spent (negative when over budget). */
  remaining: number;
  /** spent / budget, clamped to [0, 1] (1 when the budget is 0 and anything is spent). */
  spentRatio: number;
  /** spent > budget. */
  isOver: boolean;
  /** remaining / daysLeft — null when the month is over or nothing is left. */
  perDay: number | null;
};

export function resteAVivreStatus(
  budget: number,
  spent: number,
  daysLeft: number,
): ResteAVivreStatus {
  const remaining = budget - spent;
  const isOver = spent > budget;
  const spentRatio = budget > 0 ? Math.min(1, Math.max(0, spent / budget)) : spent > 0 ? 1 : 0;
  const perDay = daysLeft > 0 && remaining > 0 ? remaining / daysLeft : null;
  return { budget, spent, remaining, spentRatio, isOver, perDay };
}
