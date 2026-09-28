import {
  splitTransferToProvisions,
  type MovementRecord,
} from '@/lib/domain/accounts/operations-view';
import { provisionPartOfMonth } from '@/lib/domain/transfer';
import type { Charge, Money } from '@/lib/domain/types';

/**
 * The split of a transfer to the provisions under the rule of TODAY
 * (`provisionPartOfMonth`, #505), and whether the split written differs.
 *
 * A transfer written before that rule put the whole target in provisions; the
 * cockpit then offers « Recalculer le découpage », and the server action
 * rewrites the two parts with `splitByRule`. The page and the action read the
 * same function, so the button shows exactly when the action would write.
 *
 * The rule reads the workspace's charges as they are NOW: a charge added,
 * changed or deactivated after the transfer also makes its split differ.
 */

export type RuleSplitMovement = Pick<
  MovementRecord,
  'kind' | 'toAccountType' | 'amount' | 'cancelledAt' | 'planYear' | 'planMonth'
>;

/** Only a standing plan transfer to the provisions has a split to follow. */
export function splitRuleApplies(
  movement: RuleSplitMovement,
): movement is RuleSplitMovement & { planYear: number; planMonth: number } {
  return (
    movement.kind === 'transfer' &&
    movement.toAccountType === 'provisions' &&
    movement.cancelledAt === null &&
    movement.planYear !== null &&
    movement.planMonth !== null
  );
}

/** The split the rule gives this movement, or `null` where the rule does not apply. */
export function splitByRule(
  movement: RuleSplitMovement,
  charges: readonly Charge[],
): { provisionPart: Money; freeSavingsPart: Money } | null {
  if (!splitRuleApplies(movement)) return null;
  return splitTransferToProvisions(
    movement.amount,
    provisionPartOfMonth(charges, movement.planMonth),
  );
}

/**
 * True when the split written is not the one of the rule — compared at the
 * value, never at the Decimal scale (70 and 70.00 are equal). A missing part
 * on a transfer to the provisions differs too. False where the rule does not
 * apply: there is nothing to recalculate.
 */
export function splitDiffersFromRule(
  movement: RuleSplitMovement & Pick<MovementRecord, 'provisionPart' | 'freeSavingsPart'>,
  charges: readonly Charge[],
): boolean {
  const rule = splitByRule(movement, charges);
  if (rule === null) return false;
  const same =
    movement.provisionPart !== null &&
    movement.freeSavingsPart !== null &&
    movement.provisionPart.eq(rule.provisionPart) &&
    movement.freeSavingsPart.eq(rule.freeSavingsPart);
  return !same;
}
