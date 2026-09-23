/**
 * The expense list of the expenses page: the current month COMPLETE, then the
 * rows of other months from a capped read.
 *
 * The current month comes from ONE source only — the complete read, the same
 * one the month total is summed from. The page groups it by description and
 * those groups decompose that total (CLAUDE.md rule 10), so a current-month row
 * taken from the capped read — a row inserted or re-dated between the two
 * reads — would make the groups and the total describe two different sets.
 * From the capped read, only rows OUTSIDE the current month are kept; nothing
 * is matched by id.
 *
 * Pure TypeScript — no I/O, no framework (CLAUDE.md rule 1).
 */
export function currentMonthWithEarlier<T extends { occurredOn: string }>(
  currentMonth: readonly T[],
  capped: readonly T[],
  period: { year: number; month: number },
): T[] {
  const prefix = `${period.year}-${String(period.month).padStart(2, '0')}`;
  return [...currentMonth, ...capped.filter((row) => !row.occurredOn.startsWith(prefix))];
}
