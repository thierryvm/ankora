import { fold, type OwnDescription } from '@/lib/domain/expense-descriptions';
import type { AccountKind } from '@/lib/domain/types';

/**
 * The account a new expense is paid from when nothing says otherwise (v3
 * mock-up, rule 25): the one most expenses were paid from, « Vie courante »
 * before the first one — the schema's own default.
 *
 * `rows` are read newest first, so on a tie the account met first is the one
 * used most recently.
 */
export function defaultExpenseAccount(rows: readonly { paidFrom: AccountKind }[]): AccountKind {
  const counts = new Map<AccountKind, number>();
  for (const row of rows) counts.set(row.paidFrom, (counts.get(row.paidFrom) ?? 0) + 1);
  let best: AccountKind = 'vie_courante';
  let bestCount = 0;
  for (const [kind, count] of counts) {
    if (count > bestCount) {
      best = kind;
      bestCount = count;
    }
  }
  return best;
}

/**
 * The account of the last expense written under the same description (F-20,
 * same rule as the recalled category): an exact folded match, `null` when the
 * description is not one of the person's own or carries no account.
 */
export function recallPaidFrom(label: string, own: readonly OwnDescription[]): AccountKind | null {
  const target = fold(label);
  if (!target) return null;
  return own.find((description) => fold(description.label) === target)?.paidFrom ?? null;
}
