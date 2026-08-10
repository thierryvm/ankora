import type { AccountType } from '@/lib/domain/cockpit/types';
import type { AccountKind } from '@/lib/domain/types';

/**
 * Ankora names its three accounts twice, and has done since 2026-05-03.
 *
 *   `kind` / `label`            — `principal` · `vie_courante` · `epargne`
 *   `account_type` / `display_name` — `income_bills` · `daily_card` · `provisions`
 *
 * The second pair is canonical (ADR-008); the first was meant to disappear in a
 * "PR-D2" that never happened, and still carries the primary key of `accounts`.
 * Untangling the two is issue #359 — deliberately NOT this module's job.
 *
 * What IS this module's job: whenever a value has to cross from one vocabulary
 * to the other, it crosses HERE. A `case` written inline at a call site is a
 * bijection nobody tests and everybody eventually gets half-right.
 *
 * ## Why it throws instead of falling back
 *
 * A silent `default` would map an unknown value onto `income_bills`, and D6
 * (J4) derives account balances from exactly this column: a wrong attribution
 * shifts TWO balances in opposite directions while the total stays right —
 * the hardest kind of wrong to notice. Loud beats plausible.
 */
const KIND_TO_TYPE: Readonly<Record<AccountKind, AccountType>> = Object.freeze({
  principal: 'income_bills',
  vie_courante: 'daily_card',
  epargne: 'provisions',
});

const TYPE_TO_KIND: Readonly<Record<AccountType, AccountKind>> = Object.freeze({
  income_bills: 'principal',
  daily_card: 'vie_courante',
  provisions: 'epargne',
});

/**
 * The two vocabularies, DERIVED from the tables above rather than re-listed.
 *
 * They are exported for one reason: a test that re-lists the three values by
 * hand cannot notice a fourth account added on one side only — it keeps
 * iterating the three it knows, which stay consistent with each other, and
 * reports green. Measured by `test-quality-auditor` on 2026-08-10 against the
 * first version of this module, whose test claimed exactly that guarantee and
 * did not hold it.
 */
export const ACCOUNT_KINDS = Object.keys(KIND_TO_TYPE) as readonly AccountKind[];
export const ACCOUNT_TYPES = Object.keys(TYPE_TO_KIND) as readonly AccountType[];

/** `principal` → `income_bills`. Throws on anything else. */
export function accountTypeFromKind(kind: AccountKind): AccountType {
  const type = KIND_TO_TYPE[kind];
  if (type === undefined) {
    throw new Error(`Unknown account kind: ${String(kind)}`);
  }
  return type;
}

/** `income_bills` → `principal`. Throws on anything else. */
export function accountKindFromType(type: AccountType): AccountKind {
  const kind = TYPE_TO_KIND[type];
  if (kind === undefined) {
    throw new Error(`Unknown account type: ${String(type)}`);
  }
  return kind;
}
