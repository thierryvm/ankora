import type { AccountType } from '@/lib/domain/cockpit/types';
import { zero, type Money } from '@/lib/domain/types';

/**
 * The allocation of a transfer, as it is about to be written.
 *
 * `provisionPart` / `freeSavingsPart` mirror the two nullable columns of
 * `movements` — they exist together or not at all, never half.
 */
export type TransferAllocationInput = {
  toAccountType: AccountType;
  amount: Money;
  provisionPart: Money | null;
  freeSavingsPart: Money | null;
};

/**
 * Why an allocation is refused. One reason per FIELD the person has to go and
 * correct, not per constraint the database would raise: `movements_ventilation`
 * alone covers four of these five, and answering « la ventilation est invalide »
 * would send someone to re-read the field that was already right.
 */
export type TransferAllocationRefusalReason =
  | 'non-positive-amount'
  | 'sub-cent-precision'
  | 'allocation-required'
  | 'allocation-forbidden'
  | 'negative-part'
  | 'sum-mismatch';

export type TransferAllocationAccepted = {
  ok: true;
  amount: Money;
  provisionPart: Money | null;
  freeSavingsPart: Money | null;
};

/**
 * A refusal carries HOW FAR OFF the split is, always — including when the
 * reason is not the sum itself (rule 10 of `CLAUDE.md`: a figure that cannot be
 * opened is an order, not an information). A screen can therefore say « il
 * manque 15 € » without recomputing anything, and recomputing at the call site
 * is exactly how the message eventually stops matching the refusal.
 *
 * `allocated` treats a missing part as 0: what was allocated is what was typed.
 * `difference` is `allocated − expected`, so it reads with the sign of the
 * correction to make — negative means something is still to be assigned.
 */
export type TransferAllocationRefused = {
  ok: false;
  reason: TransferAllocationRefusalReason;
  amount: Money;
  allocated: Money;
  expected: Money;
  difference: Money;
};

export type TransferAllocationResult = TransferAllocationAccepted | TransferAllocationRefused;

/**
 * A figure no bank line can carry: more than two decimals (ADR-045 D19).
 * `null` is not sub-cent — an absent part is the business of the two
 * allocation rules, which answer with the field to go and fill.
 */
function isSubCent(value: Money | null): boolean {
  return value !== null && value.decimalPlaces() > 2;
}

function refuse(
  reason: TransferAllocationRefusalReason,
  input: TransferAllocationInput,
): TransferAllocationRefused {
  const allocated = (input.provisionPart ?? zero()).plus(input.freeSavingsPart ?? zero());
  return {
    ok: false,
    reason,
    amount: input.amount,
    allocated,
    expected: input.amount,
    difference: allocated.minus(input.amount),
  };
}

/**
 * Validates the allocation of a transfer BEFORE it reaches the database.
 *
 * ## Why this lives in the domain although a `CHECK` already enforces it
 *
 * `movements_ventilation` (`20260920000001:237-249`) is the authority, and it
 * stays the authority — this function never replaces it. But a `CHECK` answers
 * « refusé » and nothing else: it cannot say which of the two parts is wrong,
 * nor by how much, and it only speaks once the round-trip is done. This is the
 * same rule, stated where a form can act on it.
 *
 * ## Why the gap is refused and never rounded (ADR-038 D4)
 *
 * The two parts do not play the same role downstream: only the free-savings
 * part reduces what is left to transfer to the daily account, the smoothing
 * part having already left the budget at the provision line. Absorbing a cent
 * into either part therefore moves a number nobody asked to move, in a place
 * nobody will look. Equality is exact, at the cent, like the SQL it mirrors.
 *
 * ## Why the amount is checked first
 *
 * A refusal naming the split when the amount itself is 0 sends the person to
 * correct a field that is not the problem.
 */
export function validateTransferAllocation(
  input: TransferAllocationInput,
): TransferAllocationResult {
  const { toAccountType, amount, provisionPart, freeSavingsPart } = input;

  if (!amount.gt(0)) {
    return refuse('non-positive-amount', input);
  }

  // Plus de deux décimales est REFUSÉ, jamais arrondi (@thierry, 2026-09-20,
  // ADR-045 D19). `movements.amount` est `numeric(12,2)` : PostgreSQL
  // arrondirait de toute façon, mais APRÈS que l'écran a montré autre chose,
  // et la ligne écrite ne serait alors plus celle qui a été validée. Le refus
  // rend le désaccord visible du seul côté où il peut encore se corriger.
  //
  // Contrôlé sur les parts AUSSI, et pas seulement sur leur somme : 200,005 +
  // 75,445 fait exactement 275,45, donc une vérification par la somme laisse
  // passer deux parts inécrivables.
  if ([amount, provisionPart, freeSavingsPart].some(isSubCent)) {
    return refuse('sub-cent-precision', input);
  }

  // Outside the provisions account there is nothing to smooth: a split here
  // would be a number with no meaning, kept forever.
  if (toAccountType !== 'provisions') {
    if (provisionPart !== null || freeSavingsPart !== null) {
      return refuse('allocation-forbidden', input);
    }
    return { ok: true, amount, provisionPart: null, freeSavingsPart: null };
  }

  if (provisionPart === null || freeSavingsPart === null) {
    return refuse('allocation-required', input);
  }

  // Checked before the sum: two parts that compensate each other (−10 / +285)
  // sum exactly right, and would pass a sum-only check while meaning nothing.
  if (provisionPart.lt(0) || freeSavingsPart.lt(0)) {
    return refuse('negative-part', input);
  }

  if (!provisionPart.plus(freeSavingsPart).eq(amount)) {
    return refuse('sum-mismatch', input);
  }

  return { ok: true, amount, provisionPart, freeSavingsPart };
}
